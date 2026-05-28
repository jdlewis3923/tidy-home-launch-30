// Tidy — Checkr webhook receiver
//
// Receives Checkr platform callbacks. Verifies signature with
// CHECKR_WEBHOOK_SECRET. On `report.completed` (and similar terminal events),
// maps Checkr's report status to our internal bg outcome and re-uses
// `advance-applicant` so the existing email/PDF/notify flow fires unchanged.
//
// Mapping (per spec):
//   clear, engaged     → 'consider' (Justin reviews edge cases)
//   suspended, consider → 'consider'
//   dispute, canceled  → 'fail'
//
// If CHECKR_WEBHOOK_SECRET is unset we still accept the payload but log a
// warning — useful for local plumbing tests before the secret is live.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHECKR_WEBHOOK_SECRET = Deno.env.get('CHECKR_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Action = 'clear' | 'consider' | 'fail';

function mapCheckrStatus(status: string | undefined | null): Action {
  const s = (status ?? '').toLowerCase();
  if (s === 'clear' || s === 'engaged') return 'consider';
  if (s === 'suspended' || s === 'consider') return 'consider';
  if (s === 'dispute' || s === 'canceled' || s === 'cancelled') return 'fail';
  // Unknown → consider (safe default; Justin reviews)
  return 'consider';
}

async function verifySignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  if (!CHECKR_WEBHOOK_SECRET) return true; // soft-pass when not configured yet
  if (!signatureHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(CHECKR_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // Checkr sends "sha256=<hex>" or just hex depending on configuration — accept both.
  const provided = signatureHeader.replace(/^sha256=/i, '').trim().toLowerCase();
  return provided === hex;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const rawBody = await req.text();
  const sigHeader = req.headers.get('X-Checkr-Signature') ?? req.headers.get('x-checkr-signature');
  const valid = await verifySignature(rawBody, sigHeader);
  if (!valid) {
    console.warn('[checkr-webhook] invalid signature');
    return jsonResponse({ error: 'invalid_signature' }, 401);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); }
  catch { return jsonResponse({ error: 'invalid_json' }, 400); }

  const eventType: string = payload?.type ?? payload?.event ?? '';
  const obj = payload?.data?.object ?? payload?.object ?? {};
  const candidateId: string | undefined = obj?.candidate_id ?? obj?.id;
  const reportStatus: string | undefined = obj?.status;

  // Locate the applicant by Checkr candidate id.
  let applicantId: string | null = null;
  if (candidateId) {
    const { data: row } = await admin
      .from('applicants').select('id').eq('checkr_candidate_id', candidateId).maybeSingle();
    applicantId = row?.id ?? null;
  }

  // Always log raw payload to onboarding_events for audit/debug.
  if (applicantId) {
    await admin.from('onboarding_events').insert({
      applicant_id: applicantId,
      event: `checkr_webhook:${eventType || 'unknown'}`,
      metadata: { payload },
    });
  } else {
    console.warn('[checkr-webhook] no applicant for candidate', candidateId, eventType);
  }

  // Only act on terminal report events.
  const terminal = eventType.startsWith('report.') &&
    (eventType.endsWith('.completed') || eventType.endsWith('.suspended') ||
     eventType.endsWith('.disputed') || eventType.endsWith('.canceled'));
  if (!terminal || !applicantId) {
    return jsonResponse({ ok: true, applied: false, event: eventType });
  }

  const action: Action = mapCheckrStatus(reportStatus);

  // Reuse advance-applicant for downstream emails/PDFs/notifications.
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/advance-applicant`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        applicant_id: applicantId,
        action,
        notes: `Checkr report ${reportStatus ?? 'unknown'} (${eventType})`,
      }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      console.error('[checkr-webhook] advance-applicant failed', r.status, txt);
    }
  } catch (e) {
    console.error('[checkr-webhook] advance dispatch failed', e);
  }

  return jsonResponse({ ok: true, applied: true, mapped_action: action, event: eventType });
});
