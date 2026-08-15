// submit-insurance — PUBLIC endpoint used by the Insurance step on /apply and by
// a returning contractor uploading proof of coverage.
//
// Callers identify the applicant with applicant_id + the email they applied with
// (both must match an existing applicants row). The certificate of insurance is
// uploaded, service-role only, into the existing PRIVATE `contractor-coi-pdfs`
// bucket. COIs are never public — admins read them through signed URLs.
//
// Uploading a document NEVER marks insurance verified. The record is always
// created at `pending_verification`; only an admin (insurance-decision) can
// move it to `verified`.
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];

const Body = z.object({
  applicant_id: z.string().uuid(),
  email: z.string().email().max(200),
  // provider_key from public.insurance_providers ('thimble', 'other', or a future partner)
  provider: z.string().trim().max(40).default('unknown'),
  intent: z.enum(['needs_insurance', 'has_insurance']),
  service_category: z.string().trim().max(40).optional(),
  coverage_type: z.string().trim().max(60).default('general_liability'),
  carrier_name: z.string().trim().max(200).optional(),
  policy_number: z.string().trim().max(120).optional(),
  per_occurrence_limit_cents: z.number().int().min(0).max(10_000_000_000).optional(),
  aggregate_limit_cents: z.number().int().min(0).max(10_000_000_000).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  additional_insured_status: z.enum(['unknown', 'not_listed', 'requested', 'listed', 'not_applicable']).default('unknown'),
  certificate: z
    .object({
      filename: z.string().max(240),
      mime_type: z.string().max(120),
      data_base64: z.string().min(16),
    })
    .optional(),
});

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(',') ? input.slice(input.indexOf(',') + 1) : input;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const b = parsed.data;

  // Identity check — applicant_id must belong to the supplied email.
  const { data: applicant } = await admin
    .from('applicants')
    .select('id, email, first_name, last_name, contractor_id, service')
    .eq('id', b.applicant_id)
    .maybeSingle();
  if (!applicant || applicant.email.toLowerCase() !== b.email.trim().toLowerCase()) {
    return jsonResponse({ error: 'applicant_not_found' }, 404);
  }

  const serviceCategory = b.service_category ?? applicant.service ?? null;

  // Resolve the provider against the registry so unknown keys never land in the DB.
  const { data: providerRow } = await admin
    .from('insurance_providers')
    .select('provider_key')
    .eq('provider_key', b.provider)
    .maybeSingle();
  const providerKey = providerRow?.provider_key ?? (b.intent === 'needs_insurance' ? 'thimble' : 'other');

  // "I need insurance" with nothing uploaded yet: record the intent only.
  if (b.intent === 'needs_insurance' && !b.certificate) {
    const { data: row, error } = await admin
      .from('contractor_insurance')
      .insert({
        applicant_id: applicant.id,
        contractor_id: applicant.contractor_id ?? null,
        provider: providerKey,
        service_category: serviceCategory,
        coverage_type: b.coverage_type,
        verification_status: 'coverage_needed',
        additional_insured_status: b.additional_insured_status,
      })
      .select('id')
      .single();
    if (error) return jsonResponse({ error: 'insert_failed', details: error.message }, 500);

    await admin.from('applicants').update({ insurance_status: 'coverage_needed' }).eq('id', applicant.id);
    await admin.from('onboarding_events').insert({
      applicant_id: applicant.id,
      event: 'needs_insurance_selected',
      metadata: { provider: providerKey, service_category: serviceCategory },
    });
    await admin.from('insurance_audit_log').insert({
      insurance_id: row.id,
      applicant_id: applicant.id,
      contractor_id: applicant.contractor_id ?? null,
      action: 'coverage_needed_selected',
      to_status: 'coverage_needed',
      metadata: { provider: providerKey },
    });
    return jsonResponse({ ok: true, id: row.id, insurance_status: 'coverage_needed' });
  }

  // Coverage submission — a certificate is required.
  if (!b.certificate) return jsonResponse({ error: 'certificate_required' }, 400);
  if (!ALLOWED_MIME.includes(b.certificate.mime_type)) {
    return jsonResponse({ error: 'unsupported_file_type' }, 400);
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b.certificate.data_base64);
  } catch {
    return jsonResponse({ error: 'invalid_file_encoding' }, 400);
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
    return jsonResponse({ error: 'file_too_large', max_bytes: MAX_BYTES }, 400);
  }

  // Expired coverage is rejected up front instead of queueing an admin review.
  const todayStr = new Date().toISOString().slice(0, 10);
  if (b.expiration_date && b.expiration_date <= todayStr) {
    return jsonResponse({ error: 'policy_expired' }, 400);
  }

  const ext = b.certificate.mime_type === 'application/pdf'
    ? 'pdf'
    : (b.certificate.filename.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
  const path = `applicants/${applicant.id}/coi-${Date.now()}.${ext}`;

  const { error: upErr } = await admin.storage
    .from('contractor-coi-pdfs')
    .upload(path, bytes, { contentType: b.certificate.mime_type, upsert: false });
  if (upErr) return jsonResponse({ error: 'upload_failed', details: upErr.message }, 500);

  const { data: row, error: insErr } = await admin
    .from('contractor_insurance')
    .insert({
      applicant_id: applicant.id,
      contractor_id: applicant.contractor_id ?? null,
      provider: providerKey,
      service_category: serviceCategory,
      coverage_type: b.coverage_type,
      verification_method: 'manual_admin',
      carrier_name: b.carrier_name ?? null,
      policy_number: b.policy_number ?? null,
      per_occurrence_limit_cents: b.per_occurrence_limit_cents ?? null,
      aggregate_limit_cents: b.aggregate_limit_cents ?? null,
      effective_date: b.effective_date ?? null,
      expiration_date: b.expiration_date ?? null,
      certificate_path: path,
      certificate_mime: b.certificate.mime_type,
      additional_insured_status: b.additional_insured_status,
      verification_status: 'pending_verification',
      last_checked_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insErr) return jsonResponse({ error: 'insert_failed', details: insErr.message }, 500);

  await admin
    .from('applicants')
    .update({ insurance_status: 'pending_verification', insurance_expires_at: b.expiration_date ?? null })
    .eq('id', applicant.id);

  // No policy numbers in analytics/event metadata.
  await admin.from('onboarding_events').insert({
    applicant_id: applicant.id,
    event: 'insurance_verification_submitted',
    metadata: {
      provider: providerKey,
      carrier_name: b.carrier_name ?? null,
      expiration_date: b.expiration_date ?? null,
      additional_insured_status: b.additional_insured_status,
      service_category: serviceCategory,
    },
  });

  await admin.from('insurance_audit_log').insert({
    insurance_id: row.id,
    applicant_id: applicant.id,
    contractor_id: applicant.contractor_id ?? null,
    action: 'verification_submitted',
    to_status: 'pending_verification',
    metadata: { provider: providerKey, service_category: serviceCategory },
  });

  return jsonResponse({ ok: true, id: row.id, insurance_status: 'pending_verification' });
});
