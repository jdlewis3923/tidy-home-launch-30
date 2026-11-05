import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — the expected set of scheduled jobs.
//
// WHY THIS FILE EXISTS: the watchdog could only ever notice a job that STOPPED.
// A job that was never scheduled — or that a database rebuild silently dropped —
// looked identical to a healthy system, because nothing anywhere said which jobs
// are supposed to exist. This is that list, and cron-heartbeat diffs the live
// cron.job table against it every hour.
//
// Keep it in step with the committed schedules in drizzle/migrations/0075..0080.
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
  /** Deliberately switched off (e.g. hiring moved to Connecteam): inactive is expected, not drift. */
  paused?: boolean;
}

export const EXPECTED_CRON_JOBS: ExpectedCronJob[] = [
  { name: 'admin-alert-dispatch', schedule: '0 2,14 * * *', kind: 'http', fn: 'admin-alert-dispatch', purpose: 'Owner alerts: 4-hour urgent reminders and the 9 AM / 9 PM ET digests (urgent sends fire on insert).' },
  { name: 'roadmap-tick', schedule: '2 * * * *', kind: 'http', fn: 'roadmap-tick', purpose: 'Growth roadmap: 8 AM launch-day switches, kickoff texts and overdue URGENT alerts (8 AM–9 PM ET).' },
  // --- pure SQL, no HTTP hop ---
  { name: 'cron-health-snapshot', schedule: '7 * * * *', kind: 'sql', purpose: 'Refreshes the scheduled-job health snapshot the watchdog reads.' },
  { name: 'schedule-tick-hourly', schedule: '40 * * * *', kind: 'sql', purpose: 'Scheduling: activates/suspends Pro claims, applies 14-day drops, waitlist offers and holds, night-before reminders, daily pivot ladder.' },
  { name: 'pipeline-proof-tick', schedule: '25 * * * *', kind: 'sql', purpose: 'Tracks equipment-proof reminders and expiry.', paused: true },
  { name: 'hiring_tick_15min', schedule: '*/15 * * * *', kind: 'sql', purpose: 'Enforces hiring deadlines and check-ins.', paused: true },
  { name: 'lifecycle-tick-15min', schedule: '*/15 * * * *', kind: 'http', fn: 'lifecycle-tick', purpose: 'Dispatches lifecycle messages with shadow and consent gates.' },

  // --- money / contractor ---
  { name: 'referral-bonus-check-daily', schedule: '0 9 * * *', kind: 'http', fn: 'referral-bonus-check', purpose: 'Credits referral bonuses once the referred plan qualifies.' },
  { name: 'sms-outbox-release', schedule: '*/15 * * * *', kind: 'http', fn: 'sms-outbox-release', purpose: 'Releases parked texts once the send window opens.' },
  { name: 'expire-addon-requests', schedule: '* * * * *', kind: 'http', fn: 'expire-addon-requests', purpose: 'Expires unanswered add-on requests so nobody is charged late.' },
  { name: 'pro-demand-report', schedule: '15 13 * * 1', kind: 'http', fn: 'pro-demand-report', purpose: 'Weekly demand/capacity report for the Pro fleet.' },

  // --- applicants / compliance ---
  { name: 'applicant-stale-nudge-daily', schedule: '0 14 * * *', kind: 'http', fn: 'applicant-stale-nudge', purpose: 'Nudges stalled applicants (and can auto-reject) — must be visible.', paused: true },
  { name: 'coi-expiry-check-daily', schedule: '0 13 * * *', kind: 'http', fn: 'coi-expiry-check', purpose: 'Warns on certificates of insurance about to lapse.' },
  { name: 'capacity-alert-check-daily', schedule: '0 12 * * *', kind: 'http', fn: 'capacity-alert-check', purpose: 'Alarms before demand outruns the fleet.' },

  // --- reviews ---
  { name: 'google-reviews-poller-1h', schedule: '0 * * * *', kind: 'http', fn: 'google-reviews-poller', purpose: 'Pulls new Google reviews.' },

  // --- KPI family ---
  { name: 'kpi-compute-realtime', schedule: '*/5 * * * *', kind: 'http', fn: 'compute-kpi', purpose: 'Computes realtime KPIs.' },
  { name: 'kpi-compute-hourly', schedule: '0 * * * *', kind: 'http', fn: 'compute-kpi', purpose: 'Computes hourly KPIs.' },
  { name: 'kpi-external-hourly', schedule: '15 * * * *', kind: 'http', fn: 'kpi-external-fetch', purpose: 'Fetches external KPI inputs.' },
  { name: 'kpi-rollup-am', schedule: '0 11 * * *', kind: 'http', fn: 'kpi-rollup', purpose: 'Morning KPI rollup.' },
  { name: 'kpi-rollup-pm', schedule: '0 22 * * *', kind: 'http', fn: 'kpi-rollup', purpose: 'Evening KPI rollup.' },
  { name: 'kpi-alerts-am', schedule: '5 11 * * *', kind: 'http', fn: 'kpi-alerts', purpose: 'Morning KPI alerts.' },
  { name: 'kpi-alerts-pm', schedule: '5 22 * * *', kind: 'http', fn: 'kpi-alerts', purpose: 'Evening KPI alerts.' },
  { name: 'kpi-calendar-sync-daily', schedule: '0 10 * * *', kind: 'http', fn: 'kpi-calendar-sync', purpose: 'Syncs the KPI review calendar.' },

  // --- ops / marketing ---
  { name: 'hiring-forecast-daily', schedule: '0 7 * * *', kind: 'http', fn: 'hiring-forecast', purpose: 'Next-hire forecast per service (2:00 AM ET).', paused: true },
  { name: 'hiring-rescore-daily', schedule: '15 7 * * *', kind: 'http', fn: 'hiring-rescore', purpose: 'Nightly applicant rescoring (2:15 AM ET).', paused: true },
  { name: 'hiring-gates-hourly', schedule: '5 * * * *', kind: 'http', fn: 'hiring-gates', purpose: 'Service live/not-live gate check.', paused: true },
  { name: 'hiring-queue-transitions-hourly', schedule: '20 * * * *', kind: 'http', fn: 'hiring-queue-transitions', purpose: 'Call queue follow-up and cold transitions.', paused: true },
  { name: 'sequence-tick-hourly', schedule: '0 * * * *', kind: 'http', fn: 'sequence-tick', purpose: 'Onboarding sequence clock: held emails, interview reminders, cold, stall alerts.', paused: true },
  { name: 'member-ops-tick-daily', schedule: '30 11 * * *', kind: 'http', fn: 'member-ops-tick', purpose: 'Free add-on grants/expiry/reminders, car wash job scheduling and unassigned alerts, then member emails.' },
  { name: 'visit-photo-retention-daily', schedule: '30 10 * * *', kind: 'http', fn: 'visit-photo-retention', purpose: 'Deletes visit photos older than 30 days (keeps open-claim photos) and purges closed-claim photos after 30 days.' },
  { name: 'pro-onboarding-reminders-daily', schedule: '15 13 * * *', kind: 'http', fn: 'pro-onboarding-reminders', purpose: 'One reminder email per Pro listing only what is still missing (9:15 AM ET).', paused: true },
  { name: 'hiring-calendar-daily', schedule: '50 11 * * *', kind: 'http', fn: 'hiring-calendar', purpose: 'Year-one calendar tasks and heads-ups (6:50 AM ET).', paused: true },
  { name: 'cron-heartbeat', schedule: '7 * * * *', kind: 'http', fn: 'cron-heartbeat', purpose: 'The watchdog itself.' },
  { name: 'sheets-master-sync-1h', schedule: '15 * * * *', kind: 'http', fn: 'sheets-master-sync', purpose: 'Mirrors operational data to the master sheet.' },
  { name: 'social-launch-publisher', schedule: '*/5 * * * *', kind: 'http', fn: 'social-launch-publisher', purpose: 'Publishes queued launch posts.' },
  { name: 'social-plan-nightly', schedule: '15 7 * * *', kind: 'http', fn: 'social-plan', purpose: 'Re-plans the social calendar from launch dates (also runs when launch dates change).' },
  // --- added Nov 2026 (scheduled at runtime; see docs/cron-runtime-overrides.json) ---
  { name: 'ops-agents-tick', schedule: '*/15 * * * *', kind: 'sql', purpose: 'Autonomous operations audit.' },
  { name: 'signing-selftest-nightly', schedule: '15 8 * * *', kind: 'http', fn: 'signing-selftest', purpose: 'Nightly signing self-test; switches itself off once Susan signs in Connecteam.' },
  { name: 'escalate-stale-unread-replies', schedule: '5 * * * *', kind: 'sql', purpose: 'Escalates unread inbound replies.' },
  { name: 'sms-status-backfill-hourly', schedule: '35 * * * *', kind: 'http', fn: 'sms-status-backfill', purpose: 'Backfills text delivery receipts.' },
  { name: 'jobber-reconcile-nightly', schedule: '0 7 * * *', kind: 'sql', purpose: 'Nightly Jobber mirror reconcile.' },
  { name: 'connecteam-visit-reports-10min', schedule: '*/10 * * * *', kind: 'sql', purpose: 'Reads Connecteam Visit Reports to close visits and create pay lines.' },
  { name: 'pro-pay-statements-friday', schedule: '0 12 * * 5', kind: 'sql', purpose: 'Friday 7 AM Miami Pro pay statement emails.' },
  { name: 'connecteam-paperwork-15min', schedule: '*/15 * * * *', kind: 'http', fn: 'connecteam-paperwork', purpose: 'Connecteam paperwork status, COI expiry and new-hire discovery.' },
];

/** Jobs deliberately NOT scheduled — listed so "missing" never means "forgotten". */
export const RETIRED_CRON_JOBS: Array<{ name: string; reason: string }> = [
  { name: 'generate-recurring-visits-daily', reason: 'Site scheduling retired; Jobber is the schedule of record (Nov 5 audit).' },
  { name: 'pipeline-coi-tick', reason: 'Old pipeline insurance tick retired; Connecteam paperwork sync + coi-expiry-check cover it (Nov 5 audit).' },
  { name: 'notify-pro-job-today', reason: 'Lovable Pro app retired; Pros get shifts in Connecteam, never texts (Nov 5 audit).' },
  { name: 'notify-pro-visit-tomorrow', reason: 'Lovable Pro app retired; Pros get shifts in Connecteam, never texts (Nov 5 audit).' },
  { name: 'insurance-expiry-check', reason: 'Duplicated coi-expiry-check (Nov 5 audit).' },
  { name: 'training-reminder-daily', reason: 'Lovable Pro orientation reminders retired with the Pro app (Nov 5 audit).' },
  { name: 'social-posts-publisher', reason: 'Second social publisher retired — one post, one row, one door (Part F).' },
  { name: 'hiring-digest-morning', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'hiring-digest-evening', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-digest-morning', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-digest-midday', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-digest-evening', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-digest-launch', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-digest-weekly', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-plan-digest-am', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'kpi-plan-digest-pm', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'reviews-weekly-digest', reason: 'Replaced by the 9 AM / 9 PM admin digests (Part E).' },
  { name: 'daily_addon_attach_scan', reason: 'Jobber decommissioned — the function is an inert 200 stub.' },
  { name: 'jobber-schedule-sync', reason: 'Jobber decommissioned (unscheduled in 0052).' },
];

export function manifestForRpc(): Array<Record<string, unknown>> {
  return EXPECTED_CRON_JOBS.map((j) => ({ name: j.name, schedule: j.schedule, kind: j.kind, fn: j.fn ?? null, paused: j.paused ?? false }));
}
