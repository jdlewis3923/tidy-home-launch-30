-- Stop reading cron.job_run_details at capture time.
--
-- We are not its owner, so we cannot index it (must be owner of table
-- job_run_details) and the per-job lateral lookup measured 52 seconds — which is
-- what kept the watchdog timing out and therefore silent. Health is now derived
-- entirely from tables we own and have indexed: cron_runs (what was dispatched)
-- and cron_acks (what the function actually acknowledged, including refusals).
--
-- Consequence, stated plainly: the two pure-SQL jobs dispatch nothing, so they
-- report as unknown rather than green. cron-health-snapshot's own freshness is
-- proven by captured_at, which the heartbeat alarms on.
CREATE OR REPLACE FUNCTION public.capture_cron_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Small, cheap prune: pg_cron never trims its own history.
  DELETE FROM cron.job_run_details
   WHERE ctid IN (
     SELECT ctid FROM cron.job_run_details
      WHERE start_time < now() - interval '14 days'
      LIMIT 500
   );

  DELETE FROM public.cron_runs WHERE scheduled_at < now() - interval '30 days';
  DELETE FROM public.cron_acks WHERE at < now() - interval '30 days';

  DELETE FROM public.cron_health_snapshot;

  INSERT INTO public.cron_health_snapshot (
    jobid, jobname, schedule, active, last_run_at, last_status, last_message,
    expected_interval_minutes, minutes_since, stale, captured_at,
    http_status, http_error, http_at
  )
  SELECT
    j.jobid,
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.scheduled_at,
    CASE
      WHEN d.scheduled_at IS NULL THEN NULL
      WHEN a.authorized IS FALSE THEN 'refused'
      WHEN a.at IS NOT NULL AND a.at >= d.scheduled_at THEN 'succeeded'
      WHEN a.at IS NULL THEN 'no_ack'
      ELSE 'no_ack_for_last_dispatch'
    END,
    CASE
      WHEN d.scheduled_at IS NULL THEN 'no HTTP dispatch recorded (pure SQL job or never dispatched)'
      WHEN a.authorized IS FALSE THEN 'function refused the cron credential'
      WHEN a.at IS NOT NULL AND a.at < d.scheduled_at THEN 'dispatched but the function never ran'
      WHEN a.at IS NULL THEN 'no acknowledgement recorded yet'
      ELSE ''
    END,
    public.cron_expected_interval_minutes(j.schedule),
    round(extract(epoch FROM (now() - d.scheduled_at)) / 60.0, 1),
    (
      -- Dispatch itself stopped happening.
      (d.scheduled_at IS NOT NULL
        AND now() - d.scheduled_at > (public.cron_expected_interval_minutes(j.schedule) * 3) * interval '1 minute')
      -- The function acknowledged before and has now stopped answering.
      OR (a.at IS NOT NULL
          AND d.scheduled_at IS NOT NULL
          AND d.scheduled_at < now() - interval '5 minutes'
          AND a.at < d.scheduled_at)
      -- The credential was refused: a 401 nobody could see before.
      OR a.authorized IS FALSE
    ),
    now(),
    CASE WHEN a.authorized IS FALSE THEN 401
         WHEN a.at IS NOT NULL AND d.scheduled_at IS NOT NULL AND a.at >= d.scheduled_at THEN 200
         ELSE NULL END,
    CASE WHEN a.authorized IS FALSE THEN 'function refused the cron credential'
         WHEN a.at IS NOT NULL
              AND d.scheduled_at IS NOT NULL
              AND d.scheduled_at < now() - interval '5 minutes'
              AND a.at < d.scheduled_at
           THEN 'dispatched but the function never ran'
         WHEN a.at IS NULL AND d.scheduled_at IS NOT NULL
           THEN 'no acknowledgement recorded yet'
         ELSE '' END,
    a.at
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT cr.scheduled_at
    FROM public.cron_runs cr
    WHERE cr.job_name = j.jobname::text
    ORDER BY cr.scheduled_at DESC
    LIMIT 1
  ) d ON true
  LEFT JOIN LATERAL (
    SELECT ca.at, ca.authorized
    FROM public.cron_acks ca
    WHERE ca.job_name = j.jobname::text
    ORDER BY ca.at DESC
    LIMIT 1
  ) a ON true;

  SELECT count(*) INTO v_rows FROM public.cron_health_snapshot;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_cron_health() TO service_role;

CREATE INDEX IF NOT EXISTS cron_runs_job_scheduled_idx ON public.cron_runs (job_name, scheduled_at DESC);
