import '../_shared/http.ts';
/**
 * hiring-rescore — nightly at 2:15 AM. Recomputes score, tier, flags and drive
 * minutes for every applicant using the same pure function the UI uses.
 * Queue state is only ever changed by a hard-gate failure or an over-30-minute
 * drive; a human's own state (texted, replied, hired) is never overwritten.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { scoreApplicant } from '../_shared/hiring/score.ts';

const HUMAN_STATES = new Set([
  'texted', 'follow_up_due', 'followed_up', 'replied', 'call_booked',
  'interviewed', 'declined', 'cold', 'checkr', 'insurance', 'hired',
]);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Scheduled dispatches present the cron credential; admins call it by hand.
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data, error } = await admin
    .from('applicants')
    .select(
      'id, service, city_or_zip, zip, applied_on, years_in_service, owner_operator, has_insurance, ' +
      'trade_job_current, experience_matches_resume, tier_hint, notes, bilingual_gate, drivers_license, ' +
      'work_authorized, own_equipment, background_check_ok, reads_texts, queue_state, score, hiring_tier',
    );

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let updated = 0;
  const failures: string[] = [];
  for (const row of data ?? []) {
    const r = scoreApplicant({
      service: row.service,
      city_or_zip: row.city_or_zip ?? row.zip,
      applied_on: row.applied_on,
      years_in_service: row.years_in_service,
      owner_operator: row.owner_operator,
      has_insurance: row.has_insurance,
      trade_job_current: row.trade_job_current,
      experience_matches_resume: row.experience_matches_resume,
      tier_hint: row.tier_hint,
      notes: row.notes,
      bilingual: row.bilingual_gate,
      drivers_license: row.drivers_license,
      work_authorized: row.work_authorized,
      own_equipment: row.own_equipment,
      background_check_ok: row.background_check_ok,
      reads_texts: row.reads_texts,
      queue_state: row.queue_state,
    });

    const keepState = HUMAN_STATES.has(String(row.queue_state)) && r.queue_state !== 'disqualified';
    const patch: Record<string, unknown> = {
      score: r.score,
      hiring_tier: r.tier,
      flags: r.flags,
      drive_minutes: r.drive_minutes,
    };
    if (!keepState) patch.queue_state = r.queue_state;

    const { error: upErr } = await admin.from('applicants').update(patch).eq('id', row.id);
    if (upErr) failures.push(`${row.id}: ${upErr.message}`);
    else updated += 1;
  }

  return new Response(
    JSON.stringify({ ok: failures.length === 0, scanned: data?.length ?? 0, updated, failures }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
