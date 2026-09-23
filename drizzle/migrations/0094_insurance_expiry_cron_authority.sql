DO $block$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'insurance-expiry-check' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END
$block$;

SELECT cron.schedule(
  'insurance-expiry-check',
  '0 13 * * *',
  $job$SELECT public.cron_http_post('insurance-expiry-check', 'insurance-expiry-check', '{}'::jsonb);$job$
);