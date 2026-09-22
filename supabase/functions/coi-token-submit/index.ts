import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — insurance certificate upload from the private /coi/:token link.
 *
 * Public (token-scoped) endpoint. The token is long, random and expires after
 * 30 days; there is no session, so the token IS the authorisation and the
 * lookup is the gate. Rate limited per IP.
 *
 * On success it writes the certificate everywhere the two admin screens already
 * read from:
 *   - applicants.coi_*            → /admin/coi
 *   - contractor_insurance row    → /admin/insurance
 * then emails hello@jointidy.co that a certificate arrived.
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';
import { SITE } from '../_shared/pro-onboarding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'contractor-coi-pdfs';
const OWNER = 'hello@jointidy.co';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp'];
const MAX_BYTES = 12 * 1024 * 1024;

const Body = z.object({
  token: z.string().min(20).max(200),
  carrier_name: z.string().trim().min(1).max(200),
  policy_number: z.string().trim().min(1).max(100),
  effective_date: z.string().trim().min(8).max(20),
  expires_at: z.string().trim().min(8).max(20),
  file_name: z.string().trim().min(1).max(200),
  file_mime: z.string().trim().min(3).max(100),
  /** base64, no data: prefix. */
  file_base64: z.string().min(100),
});

function extFor(mime: string, name: string): string {
  const fromName = name.includes('.') ? name.split('.').pop()!.toLowerCase().slice(0, 5) : '';
  if (fromName) return fromName;
  if (mime === 'application/pdf') return 'pdf';
  return mime.split('/')[1] ?? 'bin';
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const limited = await enforceRateLimit(req, { bucket: 'coi-token-submit', limit: 10, windowSeconds: 900 });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const b = parsed.data;

  if (!ALLOWED_MIME.includes(b.file_mime)) {
    return jsonResponse({ error: 'unsupported_file_type' }, 400);
  }

  const { data: applicant } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, coi_token_expires_at, contractor_id, service')
    .eq('coi_token', b.token)
    .maybeSingle();
  if (!applicant) return jsonResponse({ error: 'invalid_token' }, 404);
  if (applicant.coi_token_expires_at && new Date(applicant.coi_token_expires_at) < new Date()) {
    return jsonResponse({ error: 'expired_token' }, 410);
  }

  let bytes: Uint8Array;
  try {
    const raw = b.file_base64.replace(/^data:[^;]+;base64,/, '');
    bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    return jsonResponse({ error: 'unreadable_file' }, 400);
  }
  if (!bytes.length || bytes.length > MAX_BYTES) {
    return jsonResponse({ error: 'file_too_large', max_mb: 12 }, 400);
  }

  const path = `${applicant.id}/coi-${Date.now()}.${extFor(b.file_mime, b.file_name)}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: b.file_mime, upsert: false });
  if (upErr) {
    console.error('[coi-token-submit] upload failed', upErr.message);
    return jsonResponse({ error: 'upload_failed' }, 500);
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await admin
    .from('applicants')
    .update({
      coi_pdf_url: path,
      coi_uploaded_at: nowIso,
      coi_carrier_name: b.carrier_name,
      coi_policy_number: b.policy_number,
      coi_effective_date: b.effective_date,
      coi_expires_at: b.expires_at,
      coi_review_status: 'pending_review',
      updated_at: nowIso,
    })
    .eq('id', applicant.id);
  if (updErr) {
    console.error('[coi-token-submit] applicant update failed', updErr.message);
    return jsonResponse({ error: 'save_failed' }, 500);
  }

  // /admin/insurance reads contractor_insurance — keep one row per applicant.
  const { data: existing } = await admin
    .from('contractor_insurance')
    .select('id')
    .eq('applicant_id', applicant.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const insurancePayload = {
    applicant_id: applicant.id,
    contractor_id: applicant.contractor_id ?? null,
    provider: 'other',
    coverage_type: 'general_liability',
    service_category: applicant.service ?? null,
    carrier_name: b.carrier_name,
    policy_number: b.policy_number,
    effective_date: b.effective_date,
    expiration_date: b.expires_at,
    certificate_path: path,
    certificate_mime: b.file_mime,
    verification_status: 'pending_verification',
    verification_method: 'manual_admin',
    updated_at: nowIso,
  };

  const insuranceWrite = existing?.id
    ? await admin.from('contractor_insurance').update(insurancePayload).eq('id', existing.id)
    : await admin.from('contractor_insurance').insert(insurancePayload);
  if (insuranceWrite.error) {
    // The certificate itself is saved; flag loudly rather than losing it.
    console.error('[coi-token-submit] insurance row failed', insuranceWrite.error.message);
  }

  await admin.from('onboarding_events').insert({
    applicant_id: applicant.id,
    event: 'coi_submitted',
    metadata: { carrier: b.carrier_name, expires_at: b.expires_at, path },
  });

  const name = `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim() || 'A Pro';
  try {
    await sendBrevoEmail({
      toEmail: OWNER,
      subject: `Insurance certificate received — ${name}`,
      htmlContent: brandedEmailHtml({
        heading: 'Certificate of insurance received',
        bodyHtml: `<p><strong>${name}</strong> uploaded their certificate.</p>
          <p>Carrier: ${b.carrier_name}<br/>Policy: ${b.policy_number}<br/>Effective: ${b.effective_date}<br/>Expires: ${b.expires_at}</p>
          <p>It is waiting for verification. Nothing is verified automatically.</p>`,
        ctaUrl: `${SITE}/admin/insurance`,
        ctaLabel: 'Review the certificate',
      }),
      tags: ['coi-submitted'],
      templateName: 'coi-submitted',
      triggeredBy: 'coi-token-submit',
      marketing: false,
    });
  } catch (e) {
    console.error('[coi-token-submit] owner email failed', e instanceof Error ? e.message : String(e));
    return jsonResponse({ ok: true, emailed: false });
  }

  return jsonResponse({ ok: true, emailed: true, status: 'submitted' });
});
