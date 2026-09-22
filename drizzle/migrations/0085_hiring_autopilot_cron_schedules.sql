-- Hiring autopilot scheduled jobs. Times are UTC; the business runs on
-- America/New_York, so each daily job is set five hours ahead of its ET time.
-- Staggered so no two hiring jobs run in the same minute.
SELECT cron.schedule('hiring-forecast-daily', '0 7 * * *', $job$SELECT public.cron_http_post('hiring-forecast-daily', 'hiring-forecast', '{}'::jsonb);$job$);
SELECT cron.schedule('hiring-rescore-daily', '15 7 * * *', $job$SELECT public.cron_http_post('hiring-rescore-daily', 'hiring-rescore', '{}'::jsonb);$job$);
SELECT cron.schedule('hiring-gates-hourly', '5 * * * *', $job$SELECT public.cron_http_post('hiring-gates-hourly', 'hiring-gates', '{}'::jsonb);$job$);
SELECT cron.schedule('hiring-queue-transitions-hourly', '20 * * * *', $job$SELECT public.cron_http_post('hiring-queue-transitions-hourly', 'hiring-queue-transitions', '{}'::jsonb);$job$);
SELECT cron.schedule('hiring-calendar-daily', '50 11 * * *', $job$SELECT public.cron_http_post('hiring-calendar-daily', 'hiring-calendar', '{}'::jsonb);$job$);
SELECT cron.schedule('hiring-digest-morning', '0 12 * * *', $job$SELECT public.cron_http_post('hiring-digest-morning', 'hiring-digest', '{"edition":"morning"}'::jsonb);$job$);
SELECT cron.schedule('hiring-digest-evening', '0 23 * * *', $job$SELECT public.cron_http_post('hiring-digest-evening', 'hiring-digest', '{"edition":"evening"}'::jsonb);$job$);