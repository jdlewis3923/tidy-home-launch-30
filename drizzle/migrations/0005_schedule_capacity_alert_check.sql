-- Capacity alerts run daily. The function itself is idempotent: it alerts once
-- per crossing, using the open row in public.capacity_crossings as the latch.
DO $$
DECLARE
  v_key text;
BEGIN
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_key IS NULL THEN
    RAISE WARNING 'service_role_key not in vault; capacity-alert-check not scheduled';
    RETURN;
  END IF;

  PERFORM cron.unschedule('capacity-alert-check-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capacity-alert-check-daily');

  PERFORM cron.schedule(
    'capacity-alert-check-daily',
    '0 12 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/capacity-alert-check',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s','apikey','%s'),
        body := '{}'::jsonb
      );
    $cmd$, v_key, v_key)
  );
END $$;
