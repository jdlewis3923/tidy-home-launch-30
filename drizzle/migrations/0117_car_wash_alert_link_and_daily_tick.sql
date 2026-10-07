DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('public.member_ops_tick()'::regprocedure) INTO src;
  src := replace(src, '''Open schedule'', ''/admin/schedule''', '''Open car wash jobs'', ''/admin/entitlements''');
  EXECUTE src;
END $$;
SELECT cron.schedule('member-ops-tick-daily', '30 11 * * *', $$SELECT public.cron_http_post('member-ops-tick-daily', 'member-ops-tick', '{}'::jsonb);$$);