// Tidy — cron-heartbeat (cron, hourly at :07).
//
// Reads public.admin_cron_health() — every job in cron.job, not the three that
// happen to be in the repo — and raises ONE admin alert per stale or failing
// job. "Stale" means no successful run within 3x its own schedule interval, or
// a last run that did not succeed. Silence is now loud.
//
// Auth: cron service credential (x-cron-key) or service-role bearer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type CronRow = {
  jobid: number;
  jobname: string;
  schedule: string;
  active: boolean;
  last_run_at: string | null;
  last_status: string | null;
  last_message: string | null;
  expected_interval_minutes: number;
  minutes_since: number | null;
  stale: boolean;
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!(await isCronAuthorized(req))) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Read the hourly snapshot, not admin_cron_health(): over HTTP that RPC walks
  // the whole run history and times out (it 500'd every run, which the new
  // response tracking is what finally showed). Refresh the snapshot first — and
  // if the refresh itself fails, say so: reading stale rows and reporting
  // "ok, 0 stale" is how the watchdog could freeze without anyone knowing.
  const { data: captured, error: capErr } = await admin.rpc('capture_cron_health');
  if (capErr) {
    await admin.from('admin_alerts').insert({
      alert_type: 'cron_snapshot_failed',
      title: 'The scheduled-job watchdog could not refresh',
      body: `capture_cron_health failed: ${capErr.message}`,
      context: { at: new Date().toISOString() },
    });
    return jsonResponse({ ok: false, error: `capture_cron_health failed: ${capErr.message}` }, 500);
  }
  const { data, error } = await admin
    .from('cron_health_snapshot')
    .select('jobid, jobname, schedule, active, last_run_at, last_status, last_message, expected_interval_minutes, minutes_since, stale, http_status, http_error, captured_at');
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);


  const jobs = (data ?? []) as CronRow[];
  const stale = jobs.filter((j) => j.active && j.stale);

  // An empty snapshot is not "no problems" — it means the watchdog has nothing
  // to look at, which reads as all-green everywhere downstream.
  if (jobs.length === 0) {
    const { data: openEmpty } = await admin
      .from('admin_alerts')
      .select('id')
      .eq('alert_type', 'cron_snapshot_empty')
      .is('resolved_at', null)
      .limit(1);
    if (!openEmpty?.length) {
      await admin.from('admin_alerts').insert({
        alert_type: 'cron_snapshot_empty',
        title: 'The scheduled-job watchdog has no jobs to check',
        body: `capture_cron_health returned ${captured ?? 0} rows. Nothing is being monitored.`,
        context: { captured_rows: captured ?? 0, at: new Date().toISOString() },
      });
    }
    return jsonResponse({ ok: false, error: 'cron_snapshot_empty', jobs_total: 0 }, 500);
  }


  let alerted = 0;
  for (const j of stale) {
    // One open alert per job — don't spam an hourly duplicate.
    const { data: existing } = await admin
      .from('admin_alerts')
      .select('id')
      .eq('alert_type', 'cron_stale')
      .is('resolved_at', null)
      .contains('context', { job_name: j.jobname })
      .limit(1);
    if (existing?.length) continue;

    await admin.from('admin_alerts').insert({
      alert_type: 'cron_stale',
      title: `Scheduled job not running: ${j.jobname}`,
      body: j.last_run_at
        ? `Last run ${j.minutes_since} min ago with status "${j.last_status}" (expected every ${j.expected_interval_minutes} min). ${j.last_message ?? ''}`.trim()
        : `Has never run. Expected every ${j.expected_interval_minutes} min.`,
      context: {
        job_name: j.jobname, jobid: j.jobid, schedule: j.schedule,
        last_run_at: j.last_run_at, last_status: j.last_status,
        expected_interval_minutes: j.expected_interval_minutes,
      },
    });
    alerted++;
  }

  // Auto-resolve alerts for jobs that recovered.
  const healthyNames = jobs.filter((j) => !j.stale).map((j) => j.jobname);
  let resolved = 0;
  for (const name of healthyNames) {
    const { data: open } = await admin
      .from('admin_alerts')
      .select('id')
      .eq('alert_type', 'cron_stale')
      .is('resolved_at', null)
      .contains('context', { job_name: name })
      .limit(5);
    for (const row of open ?? []) {
      await admin.from('admin_alerts').update({ resolved_at: new Date().toISOString() }).eq('id', row.id);
      resolved++;
    }
  }

  await admin.from('app_settings').upsert({
    key: 'cron_heartbeat_last_at',
    value: { at: new Date().toISOString(), jobs: jobs.length, stale: stale.length },
  }, { onConflict: 'key' });

  return jsonResponse({
    ok: true,
    jobs_total: jobs.length,
    stale_count: stale.length,
    alerts_opened: alerted,
    alerts_resolved: resolved,
    stale_jobs: stale.map((j) => ({
      job: j.jobname, schedule: j.schedule, last_run_at: j.last_run_at,
      last_status: j.last_status, minutes_since: j.minutes_since,
    })),
  });
});
