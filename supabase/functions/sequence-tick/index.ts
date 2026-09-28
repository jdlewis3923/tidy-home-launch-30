import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * sequence-tick — hourly. The server-side clock for the onboarding sequence.
 *  1. Releases automated emails held by quiet hours or the 48-hour cap
 *     (each goes back through the send door, which re-checks everything).
 *  2. Interview reminder (#2r) for calls 1–2 hours away.
 *  3. Screening that went cold in the call queue → stage "cold".
 *  4. Stall alerts: anyone waiting on you for 3+ days gets one Workday row a day.
 * The day-2 / day-5 chase stays in pro-onboarding-reminders (daily, 9:15 AM ET).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { STAGE_INFO, type SequenceStage } from '../_shared/onboarding-sequence.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const call = (fn: string, body: unknown) => vendorFetch(`${URL_}/functions/v1/${fn}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })).catch((e) => ({ status: 0, body: { error: String(e) } }));

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (!(await isCronAuthorized(req.clone()))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }
  const now = new Date();
  const out = { released: 0, reminders: 0, cold: 0, stalled: 0 };

  // 1. Held automated mail.
  const { data: due } = await admin.from('sequence_email_queue').select('id, applicant_id, email_key')
    .is('released_at', null).lte('due_at', now.toISOString()).limit(50);
  for (const q of due ?? []) {
    await admin.from('sequence_email_queue').update({ released_at: now.toISOString(), result: 'releasing' }).eq('id', q.id);
    const r = q.email_key === 'all_set'
      ? await call('pro-all-set', { applicant_id: q.applicant_id })
      : await call('pro-email', { applicant_id: q.applicant_id, email: q.email_key, mode: 'send', sequence: 'auto' });
    await admin.from('sequence_email_queue').update({ result: `${r.status} ${JSON.stringify(r.body).slice(0, 200)}` }).eq('id', q.id);
    out.released++;
  }

  // 2. Interview reminders — calls between 1 and 2 hours from now.
  const from = new Date(now.getTime() + 60 * 60_000).toISOString();
  const to = new Date(now.getTime() + 120 * 60_000).toISOString();
  const { data: calls } = await admin.from('applicants').select('id').eq('sequence_stage', 'interview_booked')
    .gt('call_at', from).lte('call_at', to).not('email', 'is', null);
  for (const c of calls ?? []) {
    await call('pro-email', { applicant_id: c.id, email: 'interview_reminder', mode: 'send', sequence: 'auto' });
    out.reminders++;
  }

  // 3. Cold after no reply (the call queue marks queue_state = 'cold').
  const { data: cold } = await admin.from('applicants').update({ sequence_stage: 'cold' })
    .in('sequence_stage', ['applied', 'screening']).eq('queue_state', 'cold').select('id');
  out.cold = cold?.length ?? 0;

  // 4. Stalls: waiting on you 3+ days → one Workday row per person per day.
  const cutoff = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  const youStages = (Object.keys(STAGE_INFO) as SequenceStage[]).filter((s) => STAGE_INFO[s].waitingOn === 'you');
  const { data: stalled } = await admin.from('applicants').select('id, first_name, sequence_stage, sequence_stage_entered_at')
    .in('sequence_stage', youStages).lt('sequence_stage_entered_at', cutoff);
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  for (const s of stalled ?? []) {
    const { count } = await admin.from('admin_workday_events').select('id', { count: 'exact', head: true })
      .eq('applicant_id', s.id).eq('event_type', 'sequence_stalled').gte('occurred_at', dayStart.toISOString());
    if (count) continue;
    const days = Math.floor((now.getTime() - new Date(s.sequence_stage_entered_at).getTime()) / 86_400_000);
    await admin.from('admin_workday_events').insert({
      event_type: 'sequence_stalled', applicant_id: s.id, actor_type: 'system', status: 'warning', waiting_on_admin: true,
      title: `${s.first_name ?? 'Pro'} has waited on you ${days} days`,
      detail: `Stage: ${STAGE_INFO[s.sequence_stage as SequenceStage]?.label ?? s.sequence_stage}`,
      action_label: 'Open record', action_url: `/admin/applicants?id=${s.id}`, metadata: { days },
    });
    out.stalled++;
  }

  return jsonResponse({ ok: true, ...out });
});
