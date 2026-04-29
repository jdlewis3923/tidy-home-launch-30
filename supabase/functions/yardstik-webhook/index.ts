// Tidy — Yardstik webhook receiver (Phase A)
//
// Listens for Yardstik screening events. Validates HMAC signature using
// YARDSTIK_WEBHOOK_SECRET — header `X-Yardstik-Signature`, hex HMAC-SHA256
// of the raw body. Updates the applicants row and routes notifications
// based on screening status:
//   - clear     → interview_pending, notify Justin
//   - consider  → background_check_review, Brevo + PWA + SMS to (786) 829-1141
//   - suspended/failed → rejected, send applicant rejection email
//
// Endpoint: https://<project>.supabase.co/functions/v1/yardstik-webhook

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  sendBrevoEmail,
  sendPwaPushToJustin,
  sendTwilioSmsToJustin,
  brandedEmailHtml,
} from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YARDSTIK_WEBHOOK_SECRET = Deno.env.get('YARDSTIK_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  if (!YARDSTIK_WEBHOOK_SECRET) {
    console.warn('[yardstik-webhook] YARDSTIK_WEBHOOK_SECRET missing — accepting unverified');
    return true;
  }
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(YARDSTIK_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  // Strip optional "sha256=" prefix some providers send
  const provided = signature.replace(/^sha256=/, '');
  if (hex.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const raw = await req.text();
  const sig = req.headers.get('X-Yardstik-Signature') ?? req.headers.get('x-yardstik-signature') ?? '';
  const ok = await verifySignature(raw, sig);
  if (!ok) {
    console.warn('[yardstik-webhook] invalid signature');
    return jsonResponse({ error: 'invalid_signature' }, 401);
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return jsonResponse({ error: 'bad_json' }, 400); }

  const type: string = event?.type ?? event?.event ?? '';
  const data = event?.data?.object ?? event?.data ?? event?.screening ?? event ?? {};
  const screeningId: string | undefined = data?.id ?? data?.screening_id ?? event?.screening_id;
  const candidateId: string | undefined = data?.candidate_id ?? data?.candidate?.id;
  const status: string | undefined = data?.status ?? data?.result; // clear | consider | suspended | failed

  // Only act on screening.* events. Others are acked.
  if (type && !type.startsWith('screening.')) {
    return jsonResponse({ ok: true, ignored: type });
  }

  // Find applicant — prefer screening id then candidate id.
  const { data: applicant } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, service, current_stage')
    .or(`yardstik_screening_id.eq.${screeningId ?? '__none__'},yardstik_candidate_id.eq.${candidateId ?? '__none__'}`)
    .maybeSingle();

  if (!applicant) {
    console.warn('[yardstik-webhook] no matching applicant', { screeningId, candidateId });
    return jsonResponse({ ok: true, matched: false });
  }

  const fullName = `${applicant.first_name} ${applicant.last_name}`;
  const baseUpdate: Record<string, any> = {
    yardstik_status: status ?? null,
    yardstik_completed_at: new Date().toISOString(),
  };

  if (status === 'clear') {
    await admin.from('applicants').update({
      ...baseUpdate, current_stage: 'interview_pending',
    }).eq('id', applicant.id);

    queueMicrotask(async () => {
      const html = brandedEmailHtml({
        heading: 'Background check passed ✅',
        bodyHtml: `<p><strong>${fullName}</strong> (${applicant!.service}) cleared their background check. They are ready for the interview step.</p>`,
        ctaUrl: 'https://jointidy.co/admin/applicants',
        ctaLabel: 'Open pipeline',
      });
      await sendBrevoEmail({ toEmail: 'admin@jointidy.co', toName: 'Justin', subject: `BG check PASSED: ${fullName}`, htmlContent: html });
      await sendPwaPushToJustin('BG check passed', `${fullName} ready for interview`, '/admin/applicants');
    });
  } else if (status === 'consider') {
    await admin.from('applicants').update({
      ...baseUpdate, current_stage: 'background_check_review',
    }).eq('id', applicant.id);

    queueMicrotask(async () => {
      const html = brandedEmailHtml({
        heading: 'Background check needs review ⚠️',
        bodyHtml: `<p><strong>${fullName}</strong> (${applicant!.service}) returned a <strong>CONSIDER</strong> result. Manual review required before proceeding.</p>`,
        ctaUrl: 'https://jointidy.co/admin/applicants',
        ctaLabel: 'Review now',
      });
      await sendBrevoEmail({ toEmail: 'admin@jointidy.co', toName: 'Justin', subject: `BG check REVIEW: ${fullName}`, htmlContent: html });
      await sendPwaPushToJustin('BG check needs review', `${fullName} — CONSIDER result`, '/admin/applicants');
      await sendTwilioSmsToJustin(
        `Tidy: ${fullName} bg-check CONSIDER. Review at jointidy.co/admin/applicants`,
        `yardstik-consider-${applicant!.id}`,
      );
    });
  } else if (status === 'suspended' || status === 'failed' || status === 'fail') {
    await admin.from('applicants').update({
      ...baseUpdate,
      current_stage: 'rejected',
      rejection_reason: 'background_check_failed',
      rejected_at: new Date().toISOString(),
    }).eq('id', applicant.id);

    queueMicrotask(async () => {
      const applicantHtml = brandedEmailHtml({
        heading: 'Update on your Tidy application',
        bodyHtml: `
          <p>Hi ${applicant!.first_name},</p>
          <p>Thank you for applying to join Tidy as a contractor. We've completed the background-check step that we run for every 1099 home-service contractor on our platform, and unfortunately we're not able to move forward with your application at this time.</p>
          <p>This policy applies to every applicant — it is not a judgment of you personally. You're welcome to reapply after 12 months.</p>
          <p>We appreciate your interest in Tidy and wish you the best.</p>
          <p>— Justin Lewis<br/>Founder, Tidy Home Concierge LLC</p>
        `,
      });
      await sendBrevoEmail({
        toEmail: applicant!.email,
        toName: fullName,
        subject: 'Update on your Tidy application',
        htmlContent: applicantHtml,
      });
      await sendPwaPushToJustin('Applicant auto-rejected', `${fullName} — bg check failed`, '/admin/applicants');
    });
  } else {
    // Other statuses (pending, etc.) — just record.
    await admin.from('applicants').update(baseUpdate).eq('id', applicant.id);
  }

  return jsonResponse({ ok: true, status, applicant_id: applicant.id });
});
