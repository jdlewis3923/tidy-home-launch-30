-- capture_cron_health() took ~99 seconds because cron.job_run_details had grown
-- to 306k rows / 348 MB (four months of history, pg_cron never prunes it). Any
-- HTTP caller timed out, which is why the watchdog's own refresh could not run
-- over the wire. Keep 14 days of history inside the capture itself, in a bounded
-- batch so the job never runs long.
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

  DELETE FROM cron.job_run_details
   WHERE ctid IN (
     SELECT ctid FROM cron.job_run_details
      WHERE start_time < now() - interval '14 days'
      LIMIT 20000
   );

  -- Copy each response into cron_runs while it still exists. pg_net purges
  -- net._http_response on retention, and the old INNER JOIN meant a daily job
  -- that 401s showed red for a few hours and then quietly went green again.
  UPDATE public.cron_runs cr
     SET http_status  = resp.status_code,
         http_error   = left(coalesce(resp.error_msg, ''), 300),
         timed_out    = resp.timed_out,
         responded_at = coalesce(resp.created, now())
    FROM net._http_response resp
   WHERE resp.id = cr.request_id
     AND cr.responded_at IS NULL;

  UPDATE public.cron_runs
     SET http_error = 'no response recorded',
         responded_at = now()
   WHERE responded_at IS NULL
     AND scheduled_at < now() - interval '2 hours';

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
      OR (h.http_status IS NOT NULL AND h.http_status >= 400)
      OR h.timed_out IS TRUE
      OR (h.http_status IS NULL AND coalesce(h.http_error, '') <> '')),
    now(),
    h.http_status,
    left(coalesce(h.http_error, ''), 300),
    h.responded_at
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
    SELECT cr.http_status, cr.http_error, cr.timed_out, cr.responded_at
    FROM public.cron_runs cr
    WHERE cr.job_name = j.jobname::text
      AND cr.responded_at IS NOT NULL
    ORDER BY cr.scheduled_at DESC
    LIMIT 1
  ) h ON true;

  SELECT count(*) INTO v_rows FROM public.cron_health_snapshot;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_cron_health() TO service_role;

-- cron_runs grows one row per dispatch; keep it bounded too.
CREATE INDEX IF NOT EXISTS cron_runs_job_scheduled_idx
  ON public.cron_runs (job_name, scheduled_at DESC);
