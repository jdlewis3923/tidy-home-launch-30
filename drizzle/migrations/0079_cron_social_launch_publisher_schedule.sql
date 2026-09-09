-- lovable-cron-fallback-reviewed: 288 runs/day; already scheduled in the hosted database, committing to source control only
SELECT cron.schedule('social-launch-publisher', '*/5 * * * *', $job$SELECT public.cron_http_post('social-launch-publisher', 'social-launch-publisher', '{}'::jsonb);$job$);
