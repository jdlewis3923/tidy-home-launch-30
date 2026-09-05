// Tidy — Submit Application (public)
//
// Public endpoint called by /apply. Creates an applicants row at stage='applied',
// logs an onboarding_events row with the full form payload, then fires applicant
// confirmation + admin alert via applicant-applied-trigger. No external BG check
// is invoked here — Checkr is invited later via /admin/applicants.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendPwaPushToJustin } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name:  z.string().trim().min(1).max(100),
  email:      z.string().email().max(200),
  phone:      z.string().trim().min(7).max(30).optional(),
  zip:        z.string().trim().max(10).optional(),
  service:    z.enum(['cleaning', 'lawn', 'detail', 'multiple']),
  experience_bucket: z.enum(['1-2', '3-5', '5+']).optional(),
  experience_years:  z.number().int().min(0).max(60).optional(),
  has_vehicle:     z.boolean(),
  has_supplies:    z.boolean(),
  work_authorized: z.boolean(),
  bilingual:         z.boolean(),
  insurance_willing: z.boolean(),
  fl_license:        z.boolean(),
  license_expiry:    z.string().trim().max(20).optional(),
  description: z.string().max(500).optional(),
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

    // Service-area ZIP gate (Tidy Miami: 33156 / 33183 / 33186).
    const SERVICE_ZIPS = ['33156', '33183', '33186'];
    const normalizedZip = (data.zip ?? '').trim().slice(0, 5);
    const outOfArea = normalizedZip.length === 5 && !SERVICE_ZIPS.includes(normalizedZip);

    const { data: row, error: insertErr } = await admin
      .from('applicants')
      .insert({
        first_name: data.first_name,
        last_name:  data.last_name,
        email:      data.email.toLowerCase(),
        phone:      data.phone ?? null,
        zip:        data.zip ?? null,
        service:    data.service,
        experience_years: data.experience_years ?? null,
        has_vehicle:  data.has_vehicle,
        has_supplies: data.has_supplies,
        notes_for_admin: data.description ?? null,
        current_stage: 'applied',
        out_of_service_area: outOfArea,
      })
      .select('id')
      .single();
    if (insertErr || !row) {
      console.error('[apply] insert failed', insertErr);
      return jsonResponse({ error: 'insert_failed', details: insertErr?.message }, 500);
    }
    const applicantId = row.id;

    // Log onboarding event with full form payload.
    await admin.from('onboarding_events').insert({
      applicant_id: applicantId,
      event: 'applicant_submitted',
      metadata: {
        source: 'apply_form',
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email.toLowerCase(),
        phone: data.phone ?? null,
        zip: data.zip ?? null,
        out_of_service_area: outOfArea,
        service: data.service,
        experience_bucket: data.experience_bucket ?? null,
        experience_years: data.experience_years ?? null,
        has_vehicle: data.has_vehicle,
        has_supplies: data.has_supplies,
        work_authorized: data.work_authorized,
        description: data.description ?? null,
      },
    });

    const fullName = `${data.first_name} ${data.last_name}`;
    queueMicrotask(async () => {
      await fetch(`${SUPABASE_URL}/functions/v1/applicant-applied-trigger`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicant_id: applicantId }),
      }).catch((e) => console.error('[apply] trigger failed', e));
      await sendPwaPushToJustin('New application', `${fullName} applied for ${data.service}`, '/admin/applicants');
    });

    return jsonResponse({ id: applicantId, current_stage: 'applied' }, 200);
  } catch (e: any) {
    console.error('[submit-application] error', e);
    return jsonResponse({ error: e?.message ?? 'unknown' }, 500);
  }
});
