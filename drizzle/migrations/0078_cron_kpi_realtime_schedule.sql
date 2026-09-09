-- lovable-cron-fallback-reviewed: 288 runs/day; already scheduled in the hosted database, committing to source control only
SELECT cron.schedule('kpi-compute-realtime', '*/5 * * * *', $job$SELECT public.cron_http_post('kpi-compute-realtime', 'compute-kpi', '{"frequency":"realtime"}'::jsonb);$job$);
