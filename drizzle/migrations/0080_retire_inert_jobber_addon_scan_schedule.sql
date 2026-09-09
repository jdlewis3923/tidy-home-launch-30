DO $unsched$
BEGIN
  PERFORM cron.unschedule('daily_addon_attach_scan');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$unsched$;
