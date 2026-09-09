-- Refine the ack rule: a job that has NEVER acknowledged (its function does not
-- use the shared cron-auth helper yet) must not read as failing — that would be
-- a false red. A job that HAS acknowledged before and stops, or refuses the
-- credential, is a real failure and stays red.
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

  DELETE FROM cron.job_run_details
   WHERE ctid IN (
     SELECT ctid FROM cron.job_run_details
      WHERE start_time < now() - interval '14 days'
      LIMIT 20000
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
    r.start_time,
    r.status::text,
    left(coalesce(r.return_message, ''), 300),
    public.cron_expected_interval_minutes(j.schedule),
    round(extract(epoch FROM (now() - r.start_time)) / 60.0, 1),
    (r.start_time IS NULL
      OR now() - r.start_time > (public.cron_expected_interval_minutes(j.schedule) * 3) * interval '1 minute'
      OR coalesce(r.status, 'failed') NOT IN ('succeeded', 'running')
      OR (a.at IS NOT NULL
          AND d.scheduled_at IS NOT NULL
          AND d.scheduled_at < now() - interval '5 minutes'
          AND a.at < d.scheduled_at)
      OR a.authorized IS FALSE),
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
    SELECT d2.start_time, d2.status, d2.return_message
    FROM cron.job_run_details d2
    WHERE d2.jobid = j.jobid
      AND d2.start_time > now() - interval '14 days'
    ORDER BY d2.start_time DESC
    LIMIT 1
  ) r ON true
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
