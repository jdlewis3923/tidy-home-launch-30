// Tidy — Submit Application (Phase A)
//
// Public endpoint called by /apply. Creates an applicants row, kicks off a
// Checkr background check (candidate + tasker_standard report), then notifies
// Justin via Brevo email + PWA push.
//
// Body: { first_name, last_name, email, phone, service, zip?, notes_for_admin?, dob?, ssn_last4?, no_middle_name? }
// Returns: { id, current_stage }

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, sendPwaPushToJustin, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CHECKR_API_KEY = Deno.env.get('CHECKR_API_KEY') ?? '';
const CHECKR_PACKAGE = 'tasker_standard';

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
  // Checkr requires DOB + last4 SSN to create a candidate. Optional here so
  // the basic /apply form still works even if Justin collects them later.
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ssn_last4: z.string().regex(/^\d{4}$/).optional(),
  no_middle_name: z.boolean().optional(),
  middle_name: z.string().max(100).optional(),
});

async function createCheckrCandidateAndReport(applicant: any): Promise<{ candidate_id?: string; report_id?: string; error?: string }> {
  if (!CHECKR_API_KEY) return { error: 'CHECKR_API_KEY missing' };
  if (!applicant.dob || !applicant.ssn_last4) {
    return { error: 'dob and ssn_last4 required for Checkr candidate' };
  }
  const authHeader = 'Basic ' + btoa(`${CHECKR_API_KEY}:`);

  // 1. Create candidate
  const candForm = new URLSearchParams({
    first_name: applicant.first_name,
    last_name: applicant.last_name,
    email: applicant.email,
    dob: applicant.dob,
    ssn: applicant.ssn_last4, // Checkr accepts last 4 in test/sandbox
    no_middle_name: String(!!applicant.no_middle_name),
    work_locations: JSON.stringify([{ country: 'US', state: 'FL', city: 'Miami' }]),
  });
  if (applicant.middle_name) candForm.set('middle_name', applicant.middle_name);
  if (applicant.phone) candForm.set('phone', applicant.phone);
  if (applicant.zip) candForm.set('zip', applicant.zip);

  const candRes = await fetch('https://api.checkr.com/v1/candidates', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: candForm,
  });
  const candJson = await candRes.json().catch(() => ({}));
  if (!candRes.ok) {
    console.error('[checkr] candidate create failed', candRes.status, candJson);
    return { error: `candidate ${candRes.status}: ${JSON.stringify(candJson)}` };
  }
  const candidate_id: string = candJson.id;

  // 2. Order report
  const repRes = await fetch('https://api.checkr.com/v1/reports', {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ candidate_id, package: CHECKR_PACKAGE }),
  });
  const repJson = await repRes.json().catch(() => ({}));
  if (!repRes.ok) {
    console.error('[checkr] report order failed', repRes.status, repJson);
    return { candidate_id, error: `report ${repRes.status}: ${JSON.stringify(repJson)}` };
  }
  return { candidate_id, report_id: repJson.id };
}

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

    // 1. Insert applicant row
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
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      console.error('[apply] insert failed', insertErr);
      return jsonResponse({ error: 'insert_failed', details: insertErr?.message }, 500);
    }
    const applicantId = row.id;

    // 2. Kick off Checkr (best-effort)
    const checkr = await createCheckrCandidateAndReport(data);
    if (checkr.candidate_id || checkr.report_id) {
      await admin.from('applicants').update({
        checkr_candidate_id: checkr.candidate_id ?? null,
        checkr_report_id: checkr.report_id ?? null,
        checkr_status: 'pending',
      }).eq('id', applicantId);
    } else if (checkr.error) {
      console.warn('[apply] checkr skipped:', checkr.error);
    }

    // 3. Notify Justin (best-effort, do not block response)
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
            <li>Stage: background_check_pending</li>
            ${checkr.candidate_id ? `<li>Checkr candidate: ${checkr.candidate_id}</li>` : `<li style="color:#dc2626">Checkr skipped: ${checkr.error ?? 'no key'}</li>`}
          </ul>
          ${data.notes_for_admin ? `<p><em>Note from applicant:</em> ${data.notes_for_admin}</p>` : ''}
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
