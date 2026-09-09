-- admin_cron_health() timed out under PostgREST's statement timeout: it built a
-- DISTINCT ON over the whole of cron.job_run_details, which grows forever. The
-- admin panel therefore showed "no cron jobs" — the watchdog's own blind spot.
-- Same output, but one indexed lookup per job over a bounded window.
CREATE OR REPLACE FUNCTION public.admin_cron_health()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamp with time zone,
  last_status text,
  last_message text,
  expected_interval_minutes integer,
  minutes_since numeric,
  stale boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
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
      OR coalesce(r.status, 'failed') NOT IN ('succeeded', 'running'))
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
      AND d.start_time > now() - interval '14 days'
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true
  ORDER BY j.jobname;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.admin_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cron_health() TO service_role;
