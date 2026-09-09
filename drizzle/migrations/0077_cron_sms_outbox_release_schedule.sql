-- lovable-cron-fallback-reviewed: 96 runs/day; already scheduled in the hosted database, committing to source control only
SELECT cron.schedule('sms-outbox-release', '*/15 * * * *', $job$SELECT public.cron_http_post('sms-outbox-release', 'sms-outbox-release', '{}'::jsonb);$job$);
