-- The snapshot refresh cleared the table first, but the delete does not take
-- effect under the policies on this table, so a second capture collided on the
-- primary key and every refresh failed. Upsert instead, then drop jobs that no
-- longer exist.
CREATE OR REPLACE FUNCTION public.capture_cron_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

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
      -- A job that 401s or times out on every run used to report 'succeeded'
      -- forever. The actual HTTP reply decides now.
      OR (h.status_code IS NOT NULL AND h.status_code >= 400)
      OR h.timed_out IS TRUE
      OR (h.status_code IS NULL AND h.error_msg IS NOT NULL)),
    now(),
    h.status_code,
    nullif(left(coalesce(h.error_msg, ''), 300), ''),
    h.created
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
      AND d.start_time > now() - interval '14 days'
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT resp.status_code, resp.timed_out, resp.error_msg, resp.created
    FROM public.cron_runs cr
    JOIN net._http_response resp ON resp.id = cr.request_id
    WHERE cr.job_name = j.jobname::text
    ORDER BY cr.scheduled_at DESC
    LIMIT 1
  ) h ON true
  ON CONFLICT (jobid) DO UPDATE SET
    jobname = excluded.jobname,
    schedule = excluded.schedule,
    active = excluded.active,
    last_run_at = excluded.last_run_at,
    last_status = excluded.last_status,
    last_message = excluded.last_message,
    expected_interval_minutes = excluded.expected_interval_minutes,
    minutes_since = excluded.minutes_since,
    stale = excluded.stale,
    captured_at = excluded.captured_at,
    http_status = excluded.http_status,
    http_error = excluded.http_error,
    http_at = excluded.http_at;

  DELETE FROM public.cron_health_snapshot s
  WHERE NOT EXISTS (SELECT 1 FROM cron.job j WHERE j.jobid = s.jobid);

  SELECT count(*) INTO v_rows FROM public.cron_health_snapshot;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_cron_health() TO service_role;
