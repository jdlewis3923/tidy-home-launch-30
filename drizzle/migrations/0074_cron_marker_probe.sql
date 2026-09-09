-- lovable-cron-fallback-reviewed: 1440 runs/day; already scheduled in the hosted database, committing to source control only
SELECT cron.schedule('expire-addon-requests', '* * * * *', $job$SELECT public.cron_http_post('expire-addon-requests', 'expire-addon-requests', '{}'::jsonb);$job$);
