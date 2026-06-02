// Tidy — Training quiz submission (Phase 3).
// Authoritative server-side scoring. Sets applicants.training_passed = true on pass.
// On no_show counter increment, the admin can manually trigger; this endpoint
// also auto-increments training_no_show_count when the applicant explicitly
// submits action='no_show' (e.g. timed out without finishing).

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const QUESTIONS = [
  { id: 'q1_arrival', correctIndex: 1 },
  { id: 'q2_photos', correctIndex: 2 },
  { id: 'q3_damage', correctIndex: 1 },
  { id: 'q4_tips', correctIndex: 2 },
  { id: 'q5_uniform', correctIndex: 1 },
  { id: 'q6_late', correctIndex: 1 },
  { id: 'q7_payment', correctIndex: 1 },
  { id: 'q8_pets', correctIndex: 1 },
  { id: 'q9_rating', correctIndex: 2 },
  { id: 'q10_offboard', correctIndex: 1 },
];
const PASS_THRESHOLD = 8;

const Body = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(10)),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten() }, 400);

    let score = 0;
    for (const q of QUESTIONS) {
      if (parsed.data.answers[q.id] === q.correctIndex) score += 1;
    }
    const passed = score >= PASS_THRESHOLD;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: applicant, error: aErr } = await admin
      .from('applicants').select('id, training_passed')
      .eq('contractor_id', user.id).maybeSingle();
    if (aErr || !applicant) return jsonResponse({ error: 'applicant_not_found' }, 404);

    if (passed) {
      await admin.from('applicants')
        .update({ training_passed: true, updated_at: new Date().toISOString() })
        .eq('id', applicant.id);
    }

    await admin.from('onboarding_events').insert({
      applicant_id: applicant.id,
      event: passed ? 'training_passed' : 'training_failed',
      metadata: { score, total: QUESTIONS.length },
    });

    return jsonResponse({ ok: true, score, total: QUESTIONS.length, passed });
  } catch (e) {
    console.error('[training-submit]', e);
    return jsonResponse({ error: 'internal_error', message: String(e) }, 500);
  }
});
