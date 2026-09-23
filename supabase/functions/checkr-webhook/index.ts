import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Checkr webhook receiver
//
// Signature verification is MANDATORY. Every request is HMAC-SHA256 checked
// against CHECKR_WEBHOOK_SECRET before anything else happens:
//   - secret unset          → 503, nothing processed
//   - header missing        → 401
//   - signature mismatch    → 401
//
// Handled events:
//   invitation.completed        → candidate finished Checkr's form
//   report.completed            → clear → advance to contracts sent
//                                 consider / suspended → hold + manual review
//   report.engaged              → hold + manual review
//   report.pre_adverse_action   → hold + manual review (legal steps are human)
//   report.post_adverse_action  → hold + manual review
//
// clear → clear email + onboarding email. post_adverse_action (after Checkr's
// legally required notice period) → automatic rejection email.
// Tidy stores only Checkr ids, status and timestamps — never an SSN, date of
// birth or driver's licence number.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { vendorFetch } from '../_shared/http.ts';
import { logIntegrationEvent } from '../_shared/integration-log.ts';
import { readEnv, readOptionalEnv } from '../_shared/handlerEnv.ts';

const HANDLED = new Set([
  'invitation.completed',
  'report.completed',
  'report.engaged',
  'report.pre_adverse_action',
  'report.post_adverse_action',
]);

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const secret = readOptionalEnv('CHECKR_WEBHOOK_SECRET');
  const rawBody = await req.text();

  // --- Gate 1: the secret must exist. Fail closed, never soft-pass. ---
  if (!secret) {
    console.error('[checkr-webhook] CHECKR_WEBHOOK_SECRET not set — rejecting');
    await logIntegrationEvent({
      source: 'checkr', event: 'webhook_rejected', status: 'error',
      error_message: 'CHECKR_WEBHOOK_SECRET not configured',
    });
    return jsonResponse({ error: 'webhook_secret_not_configured' }, 503);
  }

  // --- Gate 2: signature present and matching. ---
  const sigHeader = req.headers.get('X-Checkr-Signature') ?? req.headers.get('x-checkr-signature');
  if (!sigHeader) {
    await logIntegrationEvent({
      source: 'checkr', event: 'webhook_rejected', status: 'error',
      error_message: 'missing signature header',
    });
    return jsonResponse({ error: 'missing_signature' }, 401);
  }
  const expected = await hmacHex(secret, rawBody);
  const provided = sigHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  if (!timingSafeEqual(provided, expected)) {
    console.warn('[checkr-webhook] signature mismatch');
    await logIntegrationEvent({
      source: 'checkr', event: 'webhook_rejected', status: 'error',
      error_message: 'signature mismatch',
    });
    return jsonResponse({ error: 'invalid_signature' }, 401);
  }

  const env = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const);
  if (env.missing.length) return jsonResponse({ error: `MISSING_ENV: ${env.missing.join(', ')}` }, 500);
  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return jsonResponse({ error: 'invalid_json' }, 400); }

  const eventType: string = String((payload as any)?.type ?? (payload as any)?.event ?? '');
  const obj = ((payload as any)?.data?.object ?? (payload as any)?.object ?? {}) as Record<string, any>;
  const candidateId: string | undefined = obj?.candidate_id ?? obj?.id;
  const reportId: string | undefined = eventType.startsWith('report.') ? (obj?.id ?? undefined) : undefined;
  const reportStatus: string | undefined = obj?.status;
  const now = new Date().toISOString();

  await logIntegrationEvent({
    source: 'checkr',
    event: `webhook:${eventType || 'unknown'}`,
    status: 'success',
  });

  // Locate the applicant by Checkr candidate id.
  let applicantId: string | null = null;
  if (candidateId) {
    const { data: row } = await admin
      .from('applicants').select('id').eq('checkr_candidate_id', candidateId).maybeSingle();
    applicantId = row?.id ?? null;
  }

  if (applicantId) {
    await admin.from('onboarding_events').insert({
      applicant_id: applicantId,
      event: `checkr_webhook:${eventType || 'unknown'}`,
      // Checkr's object carries no SSN/DOB/DL fields; we still store only ids + status.
      metadata: { event: eventType, candidate_id: candidateId, report_id: reportId ?? null, status: reportStatus ?? null },
    });
  } else {
    console.warn('[checkr-webhook] no applicant for candidate', candidateId, eventType);
  }

  if (!HANDLED.has(eventType) || !applicantId) {
    return jsonResponse({ ok: true, applied: false, event: eventType });
  }

  const update: Record<string, unknown> = {
    checkr_last_webhook_at: now,
    updated_at: now,
    bg_check_provider: 'checkr',
  };
  if (reportId) update.checkr_report_id = reportId;
  if (reportStatus) update.checkr_report_status = reportStatus;

  let outcome: 'pending' | 'clear' | 'review' | 'reject' = 'pending';

  if (eventType === 'invitation.completed') {
    update.bg_check_status = 'pending';
    update.checkr_report_status = 'invitation_completed';
  } else if (eventType === 'report.completed') {
    const s = (reportStatus ?? '').toLowerCase();
    if (s === 'clear') {
      outcome = 'clear';
      update.bg_check_status = 'clear';
      update.bg_check_completed_at = now;
      update.bg_check_manual_review = false;
    } else {
      // consider, suspended, anything unexpected — hold in bg_check.
      outcome = 'review';
      update.bg_check_status = s === 'suspended' ? 'suspended' : 'consider';
      update.bg_check_completed_at = now;
      update.bg_check_manual_review = true;
      update.current_stage = 'bg_check';
    }
  } else if (eventType === 'report.post_adverse_action') {
    // Checkr has already delivered the legally required pre-adverse notice and
    // waiting period — the final decision is made, so send the rejection.
    outcome = 'reject';
    update.bg_check_status = 'fail';
    update.bg_check_completed_at = now;
    update.bg_check_manual_review = false;
  } else {
    // engaged / pre_adverse_action — always a human call.
    outcome = 'review';
    update.bg_check_status = 'consider';
    update.bg_check_manual_review = true;
    update.current_stage = 'bg_check';
  }

  const { error: updErr } = await admin.from('applicants').update(update).eq('id', applicantId);
  if (updErr) {
    console.error('[checkr-webhook] applicant update failed', updErr.message);
    await logIntegrationEvent({
      source: 'checkr', event: 'webhook_apply', status: 'error', error_message: updErr.message,
    });
    return jsonResponse({ error: 'update_failed' }, 500);
  }

  const callFn = async (fn: string, body: Record<string, unknown>) => {
    try {
      const r = await vendorFetch(`${env.values.SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.values.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) console.error(`[checkr-webhook] ${fn} failed`, r.status);
      return r.ok;
    } catch (e) {
      console.error(`[checkr-webhook] ${fn} dispatch failed`, (e as Error).message);
      return false;
    }
  };

  if (outcome === 'clear') {
    // Clear → "your check is clear" email, then the next-step onboarding
    // email (insurance + sizes/kit links) if it has not gone out yet.
    await callFn('advance-applicant', { applicant_id: applicantId, action: 'clear', notes: `Checkr report clear (${eventType})` });
    const { data: a } = await admin.from('applicants').select('onboarding_email_sent_at').eq('id', applicantId).maybeSingle();
    if (!a?.onboarding_email_sent_at) await callFn('pro-onboarding-email', { applicant_id: applicantId });
  } else if (outcome === 'reject') {
    await callFn('advance-applicant', { applicant_id: applicantId, action: 'fail', notes: `Checkr adverse action final (${eventType})` });
  } else if (outcome === 'review') {
    await admin.from('admin_alerts').insert({
      alert_type: 'checkr_report_needs_review',
      title: `Checkr report needs manual review (candidate ${candidateId ?? 'unknown'})`,
      context: { applicant_id: applicantId, report_id: reportId ?? null, status: reportStatus ?? null, event: eventType },
      body: `Checkr report came back "${reportStatus ?? eventType}". To reject, start Adverse Action in Checkr — once it completes, the rejection email sends automatically. To approve, press CLEAR on the applicant.`,
    });
  }

  return jsonResponse({ ok: true, applied: true, event: eventType, outcome });
});
