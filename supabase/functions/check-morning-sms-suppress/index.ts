// Tidy — Decides whether the 8:30am morning confirmation SMS should fire
// for a given Jobber visit.
//
// Inputs:
//   { jobber_visit_id, user_id, jobber_status, visit_date }
//   jobber_status: scheduled | on_route | in_progress | complete (case-insensitive)
//
// Logic:
//   - If status indicates contractor already departed (on_route or later),
//     suppress morning SMS — the ETA SMS will replace it.
//   - Otherwise allow.
//   - Records visit_sms_state row.
//
// Returns: { allow: boolean, reason?: string }

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  jobber_visit_id: z.string().min(1),
  user_id: z.string().uuid().optional(),
  jobber_status: z.string().min(1),
  visit_date: z.string().optional(),
});

const DEPARTED_STATES = new Set([
  'on_route', 'on route', 'enroute', 'en route', 'in_progress',
  'in progress', 'started', 'complete', 'completed', 'arrived',
]);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { jobber_visit_id, user_id, jobber_status, visit_date } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const departed = DEPARTED_STATES.has(jobber_status.toLowerCase());

  // Upsert visit state row.
  await admin.from('visit_sms_state').upsert({
    jobber_visit_id,
    user_id: user_id ?? null,
    visit_date: visit_date ?? null,
    morning_sms_suppressed: departed,
    morning_sms_suppression_reason: departed ? 'contractor_already_on_route' : null,
  }, { onConflict: 'jobber_visit_id' });

  if (departed) {
    return jsonResponse({ ok: true, allow: false, reason: 'contractor_already_on_route' });
  }
  return jsonResponse({ ok: true, allow: true });
});
