#!/usr/bin/env node
// Tidy — live database audit. Run it whenever you want the database itself to
// answer, rather than the repo.
//
//   node scripts/live-audit.mjs
//
// Needs the managed PG* environment (the same one psql uses). Every check prints
// PASS or FAIL plus the rows behind it, and the script exits non-zero if any
// check fails, so it can be wired into a scheduled task later.
//
// Why this is a script and not a unit test: these questions have no answer in
// the repo. "Is that job actually scheduled?", "is that grant still there?" —
// only the running database knows, and tonight proved that a fix can report
// success without landing.

import { execFileSync } from 'node:child_process';

const q = (sql) =>
  execFileSync('psql', ['-At', '-F', '\t', '-c', sql], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));

let failures = 0;
function check(title, sql, { expectEmpty = true, note = '' } = {}) {
  let rows;
  try {
    rows = q(sql);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${title}\n      query error: ${String(err.message).split('\n')[0]}`);
    return [];
  }
  const bad = expectEmpty ? rows.length > 0 : rows.length === 0;
  if (bad) failures++;
  console.log(`${bad ? 'FAIL' : 'PASS'}  ${title}${note ? ` — ${note}` : ''}`);
  if (bad) for (const r of rows.slice(0, 40)) console.log(`      ${r.join(' | ')}`);
  else if (!expectEmpty) for (const r of rows.slice(0, 10)) console.log(`      ${r.join(' | ')}`);
  return rows;
}

console.log('Tidy live audit —', new Date().toISOString(), '\n');

// 1. Authorisation guards on privileged functions.
check(
  'no SECURITY DEFINER function authorises on current_user',
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and p.prosrc like '%current_user%'
      and p.proname not in ('is_service_caller','is_privileged_caller','current_user_admin')
    order by 1`,
);

check(
  'no SECURITY DEFINER function uses the fail-open null-auth.uid() guard',
  `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and p.prosrc ~* 'auth\\.uid\\(\\)\\s+IS\\s+NOT\\s+NULL\\s+AND\\s+NOT'
    order by 1`,
);

check(
  'credential accessors are not executable by anon or authenticated',
  `select p.proname, r.rolname
     from pg_proc p
     join pg_namespace n on n.oid=p.pronamespace
     cross join unnest(array['anon','authenticated']) as r(rolname)
    where n.nspname='public'
      and p.proname in ('admin_get_service_role_key','admin_get_jobber_refresh_token',
                        'admin_get_meta_secret','admin_get_vapid_public','admin_get_vapid_private',
                        'admin_set_service_role_key','admin_set_meta_secret','admin_set_vapid_secret')
      and has_function_privilege(r.rolname, p.oid, 'EXECUTE')
    order by 1,2`,
);

// 2. Scheduled jobs. The cron schema itself is not readable by this login role,
//    so read our own hourly snapshot of it instead — the same rows the watchdog
//    reads. The manifest comparison runs inside the hourly cron-heartbeat
//    (public.cron_manifest_diff) and raises an admin alert on any difference.
check(
  'every job in the latest snapshot is active',
  `select jobname, schedule from public.cron_health_snapshot
    where captured_at = (select max(captured_at) from public.cron_health_snapshot)
      and not active order by 1`,
);

check(
  'scheduled jobs, from the latest snapshot (for the record)',
  `select jobname, schedule from public.cron_health_snapshot
    where captured_at = (select max(captured_at) from public.cron_health_snapshot)
    order by 1`,
  { expectEmpty: false, note: 'compare against supabase/functions/_shared/cron-manifest.ts' },
);

check(
  'no open watchdog alert about a job that is missing or on the wrong schedule',
  `select context->>'job_name', context->>'detail' from public.admin_alerts
    where alert_type = 'cron_manifest_drift' and resolved_at is null order by 1`,
);

check(
  'the scheduler is not paused',
  `select key, value::text from public.app_settings where key='scheduler_paused' and value::text='true'`,
);

check(
  'the watchdog snapshot is fresh (under 3 hours old)',
  `select max(captured_at)::text from public.cron_health_snapshot
    having max(captured_at) is null or max(captured_at) < now() - interval '3 hours'`,
);

// 3. Contractor pay must not be customer-readable.
check(
  'no contractor pay left inside subscription plan lines',
  `select id::text from public.subscriptions
    where plan_lines::text like '%contractor_pay_cents%' order by 1`,
);

check(
  'no contractor pay left inside the saved plan line sets',
  `select id::text from public.plan_line_sets
    where lines::text like '%contractor_pay_cents%' order by 1`,
);

check(
  'customers cannot read contractor pay columns on their own tables',
  // payout_weeks is the Pro's own pay ledger, row-scoped to the signed-in Pro,
  // so it is expected to be readable by authenticated — a customer sees no rows.
  `select r.rolname, c.relname, a.attname
     from pg_class c
     join pg_attribute a on a.attrelid=c.oid
     join pg_namespace n on n.oid=c.relnamespace
     cross join unnest(array['anon','authenticated']) as r(rolname)
    where n.nspname='public'
      and c.relname in ('visits','subscriptions','pro_visits','today_visits','invoices')
      and a.attname in ('contractor_pay_cents','visit_pay_cents')
      and a.attnum > 0 and not a.attisdropped
      and has_column_privilege(r.rolname, c.oid, a.attname, 'SELECT')
    order by 1,2,3`,
);

check(
  'anon has no access at all to the Pro pay ledger',
  `select 'payout_weeks' where has_table_privilege('anon','public.payout_weeks','SELECT')`,
);

// 4. Grants for every RPC the browser calls. Pass the list in from the repo:
//    rg -o "rpc\('([a-z_]+)'" src --replace '$1' | sort -u | paste -sd,
const RPC_LIST = process.env.TIDY_RPCS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
if (RPC_LIST.length) {
  check(
    'every RPC called from the app is still granted to authenticated',
    `select f.name from unnest(array[${RPC_LIST.map((r) => `'${r}'`).join(',')}]) as f(name)
      where not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname=f.name
           and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      order by 1`,
  );
} else {
  console.log("SKIP  RPC grant check — set TIDY_RPCS=\"a,b,c\" (see the comment above)");
}

// 5. Chatbot pricing canon is checked properly by src/test/chatbot-knowledge-canon.test.ts,
//    which reads the live row and compares against the shared figures file.
//    A naive "$" scrape here would flag every legitimate monthly total.


console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
