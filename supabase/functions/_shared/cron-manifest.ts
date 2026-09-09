import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — the expected set of scheduled jobs.
//
// WHY THIS FILE EXISTS: the watchdog could only ever notice a job that STOPPED.
// A job that was never scheduled — or that a database rebuild silently dropped —
// looked identical to a healthy system, because nothing anywhere said which jobs
// are supposed to exist. This is that list, and cron-heartbeat diffs the live
// cron.job table against it every hour.
//
// Keep it in step with drizzle/migrations/0074_cron_manifest_committed_schedules.sql
// (src/test/cron-manifest.test.ts fails the build if the two drift, if a job
// names a function that does not exist, or if a name here is not in cron.job's
// committed schedule).

export type CronJobKind = 'http' | 'sql';

export interface ExpectedCronJob {
  /** cron.job.jobname — the identity the heartbeat matches on. */
  name: string;
  schedule: string;
  kind: CronJobKind;
  /** Edge function invoked, for kind 'http'. */
  fn?: string;
  /** Why it exists, in one line — shown in the alert when it goes missing. */
  purpose: string;
}

export const EXPECTED_CRON_JOBS: ExpectedCronJob[] = [
  // --- pure SQL, no HTTP hop ---
  { name: 'cron-health-snapshot', schedule: '7 * * * *', kind: 'sql', purpose: 'Refreshes the scheduled-job health snapshot the watchdog reads.' },
  { name: 'generate-recurring-visits-daily', schedule: '30 9 * * *', kind: 'sql', purpose: 'Extends every active plan 45 days of visits.' },
  { name: 'social-posts-publisher', schedule: '* * * * *', kind: 'sql', purpose: 'Releases due social posts and fans them out to meta-publish-post.' },

  // --- money / contractor ---
  { name: 'referral-bonus-check-daily', schedule: '0 9 * * *', kind: 'http', fn: 'referral-bonus-check', purpose: 'Credits referral bonuses once the referred plan qualifies.' },
  { name: 'sms-outbox-release', schedule: '*/15 * * * *', kind: 'http', fn: 'sms-outbox-release', purpose: 'Releases parked texts once the send window opens.' },
  { name: 'expire-addon-requests', schedule: '* * * * *', kind: 'http', fn: 'expire-addon-requests', purpose: 'Expires unanswered add-on requests so nobody is charged late.' },
  { name: 'notify-pro-job-today', schedule: '0 12 * * *', kind: 'http', fn: 'notify-pro-job-today', purpose: "Tells each Pro about today's visits." },
  { name: 'notify-pro-visit-tomorrow', schedule: '0 21 * * *', kind: 'http', fn: 'notify-pro-visit-tomorrow', purpose: "Tells each Pro about tomorrow's visits." },
  { name: 'pro-demand-report', schedule: '15 13 * * 1', kind: 'http', fn: 'pro-demand-report', purpose: 'Weekly demand/capacity report for the Pro fleet.' },

  // --- applicants / compliance ---
  { name: 'applicant-stale-nudge-daily', schedule: '0 14 * * *', kind: 'http', fn: 'applicant-stale-nudge', purpose: 'Nudges stalled applicants (and can auto-reject) — must be visible.' },
  { name: 'coi-expiry-check-daily', schedule: '0 13 * * *', kind: 'http', fn: 'coi-expiry-check', purpose: 'Warns on certificates of insurance about to lapse.' },
  { name: 'insurance-expiry-check', schedule: '0 13 * * *', kind: 'http', fn: 'insurance-expiry-check', purpose: 'Blocks work when insurance has expired.' },
  { name: 'training-reminder-daily', schedule: '0 13 * * *', kind: 'http', fn: 'training-reminder', purpose: 'Reminds Pros with unfinished training.' },
  { name: 'capacity-alert-check-daily', schedule: '0 12 * * *', kind: 'http', fn: 'capacity-alert-check', purpose: 'Alarms before demand outruns the fleet.' },

  // --- reviews ---
  { name: 'google-reviews-poller-1h', schedule: '0 * * * *', kind: 'http', fn: 'google-reviews-poller', purpose: 'Pulls new Google reviews.' },
  { name: 'reviews-weekly-digest', schedule: '0 12 * * 1', kind: 'http', fn: 'reviews-weekly-digest', purpose: 'Weekly review digest.' },

  // --- KPI family ---
  { name: 'kpi-compute-realtime', schedule: '*/5 * * * *', kind: 'http', fn: 'compute-kpi', purpose: 'Computes realtime KPIs.' },
  { name: 'kpi-compute-hourly', schedule: '0 * * * *', kind: 'http', fn: 'compute-kpi', purpose: 'Computes hourly KPIs.' },
  { name: 'kpi-external-hourly', schedule: '15 * * * *', kind: 'http', fn: 'kpi-external-fetch', purpose: 'Fetches external KPI inputs.' },
  { name: 'kpi-rollup-am', schedule: '0 11 * * *', kind: 'http', fn: 'kpi-rollup', purpose: 'Morning KPI rollup.' },
  { name: 'kpi-rollup-pm', schedule: '0 22 * * *', kind: 'http', fn: 'kpi-rollup', purpose: 'Evening KPI rollup.' },
  { name: 'kpi-alerts-am', schedule: '5 11 * * *', kind: 'http', fn: 'kpi-alerts', purpose: 'Morning KPI alerts.' },
  { name: 'kpi-alerts-pm', schedule: '5 22 * * *', kind: 'http', fn: 'kpi-alerts', purpose: 'Evening KPI alerts.' },
  { name: 'kpi-plan-digest-am', schedule: '10 11 * * *', kind: 'http', fn: 'kpi-plan-digest', purpose: 'Morning plan digest.' },
  { name: 'kpi-plan-digest-pm', schedule: '10 22 * * *', kind: 'http', fn: 'kpi-plan-digest', purpose: 'Evening plan digest.' },
  { name: 'kpi-digest-morning', schedule: '0 11 * * *', kind: 'http', fn: 'kpi-digest', purpose: 'Morning pulse digest.' },
  { name: 'kpi-digest-midday', schedule: '0 16 * * *', kind: 'http', fn: 'kpi-digest', purpose: 'Midday check digest.' },
  { name: 'kpi-digest-evening', schedule: '0 0 * * *', kind: 'http', fn: 'kpi-digest', purpose: 'Evening close digest.' },
  { name: 'kpi-digest-launch', schedule: '30 */2 * * *', kind: 'http', fn: 'kpi-digest', purpose: 'Launch-window digest.' },
  { name: 'kpi-digest-weekly', schedule: '0 12 * * 1', kind: 'http', fn: 'kpi-digest', purpose: 'Weekly review digest.' },
  { name: 'kpi-calendar-sync-daily', schedule: '0 10 * * *', kind: 'http', fn: 'kpi-calendar-sync', purpose: 'Syncs the KPI review calendar.' },

  // --- ops / marketing ---
  { name: 'cron-heartbeat', schedule: '7 * * * *', kind: 'http', fn: 'cron-heartbeat', purpose: 'The watchdog itself.' },
  { name: 'sheets-master-sync-1h', schedule: '15 * * * *', kind: 'http', fn: 'sheets-master-sync', purpose: 'Mirrors operational data to the master sheet.' },
  { name: 'social-launch-publisher', schedule: '*/5 * * * *', kind: 'http', fn: 'social-launch-publisher', purpose: 'Publishes queued launch posts.' },
];

/** Jobs deliberately NOT scheduled — listed so "missing" never means "forgotten". */
export const RETIRED_CRON_JOBS: Array<{ name: string; reason: string }> = [
  { name: 'daily_addon_attach_scan', reason: 'Jobber decommissioned — the function is an inert 200 stub.' },
  { name: 'jobber-schedule-sync', reason: 'Jobber decommissioned (unscheduled in 0052).' },
];

export function manifestForRpc(): Array<Record<string, unknown>> {
  return EXPECTED_CRON_JOBS.map((j) => ({ name: j.name, schedule: j.schedule, kind: j.kind, fn: j.fn ?? null }));
}
