CREATE OR REPLACE FUNCTION public.dispatch_due_social_posts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_key text;
  v_url text;
  v_count integer := 0;
  v_id uuid;
  v_req bigint;
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF public.is_scheduler_paused() THEN
    RETURN 0;
  END IF;

  v_key := public.admin_get_service_role_key();
  v_url := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/meta-publish-post';

  FOR v_id IN
    UPDATE public.social_posts
       SET status = 'ready', updated_at = now()
     WHERE status = 'scheduled'
       AND scheduled_at <= now()
    RETURNING id
  LOOP
    SELECT net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_key, ''),
        'x-cron-job', 'social-posts-publisher'
      ),
      body := jsonb_build_object('post_id', v_id::text, 'cron_job', 'social-posts-publisher')
    ) INTO v_req;

    INSERT INTO public.cron_runs (job_name, request_id, context)
    VALUES ('social-posts-publisher', v_req, jsonb_build_object('post_id', v_id::text));
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.dispatch_due_social_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_social_posts() TO service_role;

SELECT cron.schedule('cron-health-snapshot', '7 * * * *', $job$SELECT public.capture_cron_health();$job$);
SELECT cron.schedule('generate-recurring-visits-daily', '30 9 * * *', $job$SELECT public.generate_recurring_visits(NULL, 45);$job$);

SELECT cron.schedule('referral-bonus-check-daily', '0 9 * * *', $job$SELECT public.cron_http_post('referral-bonus-check-daily', 'referral-bonus-check', '{}'::jsonb);$job$);
SELECT cron.schedule('notify-pro-job-today', '0 12 * * *', $job$SELECT public.cron_http_post('notify-pro-job-today', 'notify-pro-job-today', '{}'::jsonb);$job$);
SELECT cron.schedule('notify-pro-visit-tomorrow', '0 21 * * *', $job$SELECT public.cron_http_post('notify-pro-visit-tomorrow', 'notify-pro-visit-tomorrow', '{}'::jsonb);$job$);
SELECT cron.schedule('pro-demand-report', '15 13 * * 1', $job$SELECT public.cron_http_post('pro-demand-report', 'pro-demand-report', '{}'::jsonb);$job$);

SELECT cron.schedule('applicant-stale-nudge-daily', '0 14 * * *', $job$SELECT public.cron_http_post('applicant-stale-nudge-daily', 'applicant-stale-nudge', '{}'::jsonb);$job$);
SELECT cron.schedule('coi-expiry-check-daily', '0 13 * * *', $job$SELECT public.cron_http_post('coi-expiry-check-daily', 'coi-expiry-check', '{}'::jsonb);$job$);
SELECT cron.schedule('insurance-expiry-check', '0 13 * * *', $job$SELECT public.cron_http_post('insurance-expiry-check', 'insurance-expiry-check', '{}'::jsonb);$job$);
SELECT cron.schedule('training-reminder-daily', '0 13 * * *', $job$SELECT public.cron_http_post('training-reminder-daily', 'training-reminder', '{}'::jsonb);$job$);
SELECT cron.schedule('capacity-alert-check-daily', '0 12 * * *', $job$SELECT public.cron_http_post('capacity-alert-check-daily', 'capacity-alert-check', '{}'::jsonb);$job$);

SELECT cron.schedule('google-reviews-poller-1h', '0 * * * *', $job$SELECT public.cron_http_post('google-reviews-poller-1h', 'google-reviews-poller', '{}'::jsonb);$job$);
SELECT cron.schedule('reviews-weekly-digest', '0 12 * * 1', $job$SELECT public.cron_http_post('reviews-weekly-digest', 'reviews-weekly-digest', '{}'::jsonb);$job$);

SELECT cron.schedule('kpi-compute-hourly', '0 * * * *', $job$SELECT public.cron_http_post('kpi-compute-hourly', 'compute-kpi', '{"frequency":"hourly"}'::jsonb);$job$);
SELECT cron.schedule('kpi-external-hourly', '15 * * * *', $job$SELECT public.cron_http_post('kpi-external-hourly', 'kpi-external-fetch', '{}'::jsonb);$job$);
SELECT cron.schedule('kpi-rollup-am', '0 11 * * *', $job$SELECT public.cron_http_post('kpi-rollup-am', 'kpi-rollup', '{"window":"am"}'::jsonb);$job$);
SELECT cron.schedule('kpi-rollup-pm', '0 22 * * *', $job$SELECT public.cron_http_post('kpi-rollup-pm', 'kpi-rollup', '{"window":"pm"}'::jsonb);$job$);
SELECT cron.schedule('kpi-alerts-am', '5 11 * * *', $job$SELECT public.cron_http_post('kpi-alerts-am', 'kpi-alerts', '{"window":"am"}'::jsonb);$job$);
SELECT cron.schedule('kpi-alerts-pm', '5 22 * * *', $job$SELECT public.cron_http_post('kpi-alerts-pm', 'kpi-alerts', '{"window":"pm"}'::jsonb);$job$);
SELECT cron.schedule('kpi-plan-digest-am', '10 11 * * *', $job$SELECT public.cron_http_post('kpi-plan-digest-am', 'kpi-plan-digest', '{"window":"am"}'::jsonb);$job$);
SELECT cron.schedule('kpi-plan-digest-pm', '10 22 * * *', $job$SELECT public.cron_http_post('kpi-plan-digest-pm', 'kpi-plan-digest', '{"window":"pm"}'::jsonb);$job$);
SELECT cron.schedule('kpi-digest-morning', '0 11 * * *', $job$SELECT public.cron_http_post('kpi-digest-morning', 'kpi-digest', '{"variant":"morning_pulse"}'::jsonb);$job$);
SELECT cron.schedule('kpi-digest-midday', '0 16 * * *', $job$SELECT public.cron_http_post('kpi-digest-midday', 'kpi-digest', '{"variant":"midday_check"}'::jsonb);$job$);
SELECT cron.schedule('kpi-digest-evening', '0 0 * * *', $job$SELECT public.cron_http_post('kpi-digest-evening', 'kpi-digest', '{"variant":"evening_close"}'::jsonb);$job$);
SELECT cron.schedule('kpi-digest-launch', '30 */2 * * *', $job$SELECT public.cron_http_post('kpi-digest-launch', 'kpi-digest', '{"variant":"launch_window"}'::jsonb);$job$);
SELECT cron.schedule('kpi-digest-weekly', '0 12 * * 1', $job$SELECT public.cron_http_post('kpi-digest-weekly', 'kpi-digest', '{"variant":"weekly_review"}'::jsonb);$job$);
SELECT cron.schedule('kpi-calendar-sync-daily', '0 10 * * *', $job$SELECT public.cron_http_post('kpi-calendar-sync-daily', 'kpi-calendar-sync', '{}'::jsonb);$job$);

SELECT cron.schedule('cron-heartbeat', '7 * * * *', $job$SELECT public.cron_http_post('cron-heartbeat', 'cron-heartbeat', '{}'::jsonb);$job$);
SELECT cron.schedule('sheets-master-sync-1h', '15 * * * *', $job$SELECT public.cron_http_post('sheets-master-sync-1h', 'sheets-master-sync', '{}'::jsonb);$job$);

CREATE OR REPLACE FUNCTION public.cron_manifest_diff(_expected jsonb)
RETURNS TABLE(problem text, job_name text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH expected AS (
    SELECT e->>'name' AS name, e->>'schedule' AS schedule, e->>'kind' AS kind, e->>'fn' AS fn
    FROM jsonb_array_elements(_expected) AS e
  ),
  live AS (
    SELECT jobname, schedule, active, command FROM cron.job
  )
  SELECT 'never_scheduled', e.name,
         'Expected every "' || e.schedule || '" but there is no such job in the database.'
    FROM expected e LEFT JOIN live l ON l.jobname = e.name
   WHERE l.jobname IS NULL
  UNION ALL
  SELECT 'inactive', e.name, 'Job exists but is switched off.'
    FROM expected e JOIN live l ON l.jobname = e.name
   WHERE NOT l.active
  UNION ALL
  SELECT 'schedule_drift', e.name,
         'Expected "' || e.schedule || '", database says "' || l.schedule || '".'
    FROM expected e JOIN live l ON l.jobname = e.name
   WHERE l.schedule <> e.schedule
  UNION ALL
  SELECT 'wrong_target', e.name,
         'Command does not call the expected function "' || e.fn || '".'
    FROM expected e JOIN live l ON l.jobname = e.name
   WHERE e.kind = 'http' AND e.fn IS NOT NULL AND position(e.fn in l.command) = 0
  UNION ALL
  SELECT 'unexpected', l.jobname, 'Scheduled in the database but absent from the repo manifest.'
    FROM live l LEFT JOIN expected e ON e.name = l.jobname
   WHERE e.name IS NULL;
$fn$;

REVOKE EXECUTE ON FUNCTION public.cron_manifest_diff(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cron_manifest_diff(jsonb) TO service_role, authenticated;
