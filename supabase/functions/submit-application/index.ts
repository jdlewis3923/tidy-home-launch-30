// Tidy — Submit Application (Phase A, Yardstik)
//
// Public endpoint called by /apply. Creates an applicants row, kicks off a
// Yardstik background check (candidate + screening), then notifies Justin
// via Brevo email + PWA push.
//
// Body: { first_name, last_name, email, phone, service, zip?, notes_for_admin?, dob?, ssn_last4? }
// Returns: { id, current_stage }

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, sendPwaPushToJustin, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YARDSTIK_API_KEY = Deno.env.get('YARDSTIK_API_KEY') ?? '';
const YARDSTIK_BASE = 'https://api.yardstik.com/api/v2';

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
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ssn_last4: z.string().regex(/^\d{4}$/).optional(),
  middle_name: z.string().max(100).optional(),
});

// Cleaning + detail involve driving to the home/vehicle → MVR add-on. Lawn = no vehicle screening.
function packageForService(service: string): string {
  return service === 'lawn' ? 'basic_plus' : 'basic_plus_mvr';
}

async function createYardstikCandidateAndScreening(applicant: any): Promise<{
  candidate_id?: string; screening_id?: string; error?: string;
}> {
  if (!YARDSTIK_API_KEY) return { error: 'YARDSTIK_API_KEY missing' };
  if (!applicant.dob || !applicant.ssn_last4) {
    return { error: 'dob and ssn_last4 required for Yardstik candidate' };
  }
  const headers = {
    Authorization: `Bearer ${YARDSTIK_API_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // 1. Create candidate
  const candBody: Record<string, unknown> = {
    candidate: {
      first_name: applicant.first_name,
      last_name: applicant.last_name,
      email: applicant.email,
      dob: applicant.dob,
      ssn_last4: applicant.ssn_last4,
      phone: applicant.phone ?? undefined,
      zip: applicant.zip ?? undefined,
      middle_name: applicant.middle_name ?? undefined,
      work_locations: [{ country: 'US', state: 'FL', city: 'Miami' }],
    },
  };

  const candRes = await fetch(`${YARDSTIK_BASE}/candidates`, {
    method: 'POST', headers, body: JSON.stringify(candBody),
  });
  const candJson = await candRes.json().catch(() => ({}));
  if (!candRes.ok) {
    console.error('[yardstik] candidate create failed', candRes.status, candJson);
    return { error: `candidate ${candRes.status}: ${JSON.stringify(candJson)}` };
  }
  const candidate_id: string = candJson?.candidate?.id ?? candJson?.id;

  // 2. Order screening
  const pkg = packageForService(applicant.service);
  const screenRes = await fetch(`${YARDSTIK_BASE}/screenings`, {
    method: 'POST', headers,
    body: JSON.stringify({ screening: { candidate_id, package_slug: pkg } }),
  });
  const screenJson = await screenRes.json().catch(() => ({}));
  if (!screenRes.ok) {
    console.error('[yardstik] screening order failed', screenRes.status, screenJson);
    return { candidate_id, error: `screening ${screenRes.status}: ${JSON.stringify(screenJson)}` };
  }
  const screening_id: string = screenJson?.screening?.id ?? screenJson?.id;
  return { candidate_id, screening_id };
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

    // 2. Kick off Yardstik (best-effort)
    const ys = await createYardstikCandidateAndScreening(data);
    if (ys.candidate_id || ys.screening_id) {
      await admin.from('applicants').update({
        yardstik_candidate_id: ys.candidate_id ?? null,
        yardstik_screening_id: ys.screening_id ?? null,
        yardstik_status: 'pending',
      }).eq('id', applicantId);
    } else if (ys.error) {
      console.warn('[apply] yardstik skipped:', ys.error);
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
            ${ys.candidate_id ? `<li>Yardstik candidate: ${ys.candidate_id}</li>` : `<li style="color:#dc2626">Yardstik skipped: ${ys.error ?? 'no key'}</li>`}
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
