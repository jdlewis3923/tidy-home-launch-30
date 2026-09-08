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

  const { data, error } = await admin.rpc('admin_cron_health');
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  const jobs = (data ?? []) as CronRow[];
  const stale = jobs.filter((j) => j.active && j.stale);

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
