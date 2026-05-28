// Tidy — Applicant Applied Trigger (public)
//
// Called by submit-application right after the applicants row is inserted.
// Sends two Brevo emails:
//   1. "Thanks for applying to Tidy" → confirmation to the applicant
//      (signed Justin Lewis, Tidy Home Concierge)
//   2. Admin alert to admin@jointidy.co with applicant snapshot + direct
//      link to /admin/applicants

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

  // 1. Confirmation to applicant
  const applicantHtml = brandedEmailHtml({
    heading: 'Thanks for applying to Tidy',
    bodyHtml: `
      <p>Hi ${a.first_name},</p>
      <p>Thanks for applying to join the Tidy team as a <strong>${a.service}</strong> pro in Miami.
      We've received your application and will review it within <strong>2–3 business days</strong>.</p>
      <p>If you're a fit, we'll reach out by email or phone to schedule a short conversation
      and start the background check (at Tidy's expense).</p>
      <p>In the meantime, no action needed on your end.</p>
      <p style="margin-top:24px">— Justin Lewis<br/>Tidy Home Concierge</p>
    `,
  });
  await sendBrevoEmail({
    toEmail: a.email, toName: fullName,
    subject: 'Thanks for applying to Tidy',
    htmlContent: applicantHtml,
    tags: ['applicant-applied'],
    templateName: 'applicant-applied',
    triggeredBy: 'applicant-applied-trigger',
  }).catch((e) => console.error('[applicant-applied] applicant email failed', e));

  // 2. Admin alert
  const drawerUrl = `https://jointidy.co/admin/applicants?id=${a.id}`;
  const adminHtml = brandedEmailHtml({
    heading: 'New contractor application',
    bodyHtml: `
      <p><strong>${fullName}</strong> just applied for <strong>${a.service}</strong>.</p>
      <ul style="padding-left:18px;line-height:1.7">
        <li><strong>Email:</strong> ${a.email}</li>
        <li><strong>Phone:</strong> ${a.phone ?? '—'}</li>
        <li><strong>ZIP:</strong> ${a.zip ?? '—'}</li>
        <li><strong>Service:</strong> ${a.service}</li>
      </ul>
    `,
    ctaUrl: drawerUrl,
    ctaLabel: 'Open applicant in admin',
  });
  await sendBrevoEmail({
    toEmail: 'admin@jointidy.co', toName: 'Justin',
    subject: `New applicant: ${fullName} (${a.service})`,
    htmlContent: adminHtml,
    tags: ['admin-new-applicant'],
    templateName: 'admin-new-applicant',
    triggeredBy: 'applicant-applied-trigger',
  }).catch((e) => console.error('[applicant-applied] admin email failed', e));

  // 3. Sync to Tidy Master sheet (Applicants tab) — non-blocking.
  admin.functions.invoke('sync-applicant-to-sheet', {
    body: { applicant_id: a.id, last_event: 'applicant_submitted', last_event_at: new Date().toISOString() },
  }).catch((e) => console.error('[applicant-applied] sheet sync failed', e));

  return jsonResponse({ ok: true });
});
