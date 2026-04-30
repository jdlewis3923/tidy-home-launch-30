// Tidy — Applicant Applied Trigger (public)
//
// Called by /apply right after submit-application inserts the row.
// Sends two Brevo emails:
//   1. "applicant-applied" → confirmation to the applicant
//   2. "admin-new-applicant" → alert to admin@jointidy.co
//
// Brevo template names are sent as `tags` so a Brevo automation can route on
// them. Body is inline branded HTML (matches existing project pattern).

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({ applicant_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: a, error } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, phone, service, zip')
    .eq('id', parsed.data.applicant_id).single();
  if (error || !a) return jsonResponse({ error: 'not_found' }, 404);

  const fullName = `${a.first_name} ${a.last_name}`;

  // Write the 'applied' onboarding_events row (audit trail).
  const evt = await admin.from('onboarding_events').insert({
    applicant_id: a.id,
    event: 'applied',
    metadata: { source: 'apply_form', service: a.service, zip: a.zip },
  });
  if (evt.error) console.error('[applicant-applied] onboarding_events insert failed', evt.error);

  // 1. Confirmation to applicant
  const applicantHtml = brandedEmailHtml({
    heading: 'Application received',
    bodyHtml: `
      <p>Hi ${a.first_name},</p>
      <p>Thanks for applying to be a Tidy <strong>${a.service}</strong> contractor in Miami.
      We've received your application and our team will review it within 5 business days.</p>
      <p>Next steps: a quick background check, then a short interview if you're a fit.</p>
      <p>— The Tidy team</p>
    `,
  });
  await sendBrevoEmail({
    toEmail: a.email, toName: fullName,
    subject: 'We received your Tidy application',
    htmlContent: applicantHtml,
    tags: ['applicant-applied'],
  }).catch((e) => console.error('[applicant-applied] applicant email failed', e));

  // 2. Admin alert
  const adminHtml = brandedEmailHtml({
    heading: 'New contractor application',
    bodyHtml: `
      <p><strong>${fullName}</strong> just applied for <strong>${a.service}</strong>.</p>
      <ul style="padding-left:18px">
        <li>Email: ${a.email}</li>
        <li>Phone: ${a.phone ?? '—'}</li>
        <li>ZIP: ${a.zip ?? '—'}</li>
      </ul>
    `,
    ctaUrl: 'https://jointidy.co/admin/applicants',
    ctaLabel: 'Open pipeline',
  });
  await sendBrevoEmail({
    toEmail: 'admin@jointidy.co', toName: 'Justin',
    subject: `New applicant: ${fullName} (${a.service})`,
    htmlContent: adminHtml,
    tags: ['admin-new-applicant'],
  }).catch((e) => console.error('[applicant-applied] admin email failed', e));

  // 3. Sync to Tidy Master sheet (Applicants tab) — non-blocking.
  admin.functions.invoke('sync-applicant-to-sheet', {
    body: { applicant_id: a.id, last_event: 'applied', last_event_at: new Date().toISOString() },
  }).catch((e) => console.error('[applicant-applied] sheet sync failed', e));

  return jsonResponse({ ok: true });
});
