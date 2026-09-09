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

// 2. Scheduled jobs.
check(
  'every scheduled job is active and has a command',
  `select jobname, schedule from cron.job where not active or coalesce(command,'')='' order by 1`,
);

check(
  'no scheduled job calls a helper with an empty job name',
  `select jobname from cron.job where command like '%cron_http_post(%''''%' order by 1`,
);

check('scheduled jobs (for the record)', `select jobname, schedule from cron.job order by 1`, {
  expectEmpty: false,
  note: 'compare against supabase/functions/_shared/cron-manifest.ts',
});

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
  'anon and authenticated cannot read contractor pay columns',
  `select r.rolname, c.relname, a.attname
     from pg_class c
     join pg_attribute a on a.attrelid=c.oid
     join pg_namespace n on n.oid=c.relnamespace
     cross join unnest(array['anon','authenticated']) as r(rolname)
    where n.nspname='public'
      and a.attname in ('contractor_pay_cents','visit_pay_cents')
      and a.attnum > 0 and not a.attisdropped
      and has_column_privilege(r.rolname, c.oid, a.attname, 'SELECT')
    order by 1,2,3`,
);

// 4. Grants for every RPC the browser calls. Pass the list in from the repo:
//    rg -o "rpc\('([a-z_]+)'" src --replace '$1' | sort -u
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

// 5. Chatbot knowledge must not contain a price outside canon.
const CANON = [139, 128, 114, 189, 174, 155, 279, 257, 229, 45, 41, 37, 65, 60, 53, 99, 91, 81];
check(
  'the live chatbot knowledge quotes no price outside canon',
  `with figures as (
     select id::text, unnest(regexp_matches(content, '\\$([0-9]+)', 'g'))::int as amount
       from public.chatbot_knowledge)
   select id, amount::text from figures
    where amount not in (${CANON.join(',')})
    order by 2`,
);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
