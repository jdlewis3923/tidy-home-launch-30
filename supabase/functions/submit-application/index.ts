// Tidy — Submit Application (Phase A, manual BG check)
//
// Public endpoint called by /apply. Creates an applicants row in
// `background_check_pending`, then notifies Justin via Brevo + PWA push.
// No external background-check provider is wired yet — Justin advances each
// applicant manually from /admin/applicants via the manual-bg-check edge fn.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, sendPwaPushToJustin, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().email().max(200),
  phone: z.string().trim().min(7).max(30).optional(),
  service: z.enum(['cleaning', 'lawn', 'detail']),
  zip: z.string().trim().max(10).optional(),
  notes_for_admin: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
    }
    const data = parsed.data;

    const { data: row, error: insertErr } = await admin
      .from('applicants')
      .insert({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        zip: data.zip ?? null,
        service: data.service,
        notes_for_admin: data.notes_for_admin ?? null,
        current_stage: 'background_check_pending',
        bg_check_status: 'pending',
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      console.error('[apply] insert failed', insertErr);
      return jsonResponse({ error: 'insert_failed', details: insertErr?.message }, 500);
    }
    const applicantId = row.id;

    const fullName = `${data.first_name} ${data.last_name}`;
    queueMicrotask(async () => {
      const subject = `New application: ${fullName} for ${data.service}`;
      const html = brandedEmailHtml({
        heading: 'New contractor application',
        bodyHtml: `
          <p><strong>${fullName}</strong> just applied to be a Tidy <strong>${data.service}</strong> contractor.</p>
          <ul style="padding-left:18px">
            <li>Email: ${data.email}</li>
            ${data.phone ? `<li>Phone: ${data.phone}</li>` : ''}
            ${data.zip ? `<li>ZIP: ${data.zip}</li>` : ''}
            <li>Stage: background_check_pending (manual review)</li>
          </ul>
          ${data.notes_for_admin ? `<p><em>Note from applicant:</em> ${data.notes_for_admin}</p>` : ''}
          <p style="margin-top:14px">Open the pipeline to mark CLEAR / CONSIDER / FAIL.</p>
        `,
        ctaUrl: 'https://jointidy.co/admin/applicants',
        ctaLabel: 'Open pipeline',
      });
      await sendBrevoEmail({ toEmail: 'admin@jointidy.co', toName: 'Justin', subject, htmlContent: html });
      await sendPwaPushToJustin('New application', `${fullName} applied for ${data.service}`, '/admin/applicants');
    });

    return jsonResponse({ id: applicantId, current_stage: 'background_check_pending' }, 200);
  } catch (e: any) {
    console.error('[submit-application] error', e);
    return jsonResponse({ error: e?.message ?? 'unknown' }, 500);
  }
});
