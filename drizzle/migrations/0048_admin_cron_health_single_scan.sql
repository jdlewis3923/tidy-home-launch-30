CREATE OR REPLACE FUNCTION public.admin_cron_health()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  expected_interval_minutes integer,
  minutes_since numeric,
  stale boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- cron.job_run_details has no (jobid, start_time) index, so do exactly one
  -- pass over it and aggregate, instead of one lookup per job.
  RETURN QUERY
  WITH latest AS (
    SELECT d.jobid, max(d.start_time) AS start_time
    FROM cron.job_run_details d
    GROUP BY d.jobid
  ), lastrun AS (
    SELECT DISTINCT ON (l.jobid)
      l.jobid, l.start_time, d.status, d.return_message
    FROM latest l
    JOIN cron.job_run_details d
      ON d.jobid = l.jobid AND d.start_time = l.start_time
    ORDER BY l.jobid, d.runid DESC
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
      OR coalesce(r.status, 'failed') NOT IN ('succeeded','running'))
  FROM cron.job j
  LEFT JOIN lastrun r ON r.jobid = j.jobid
  ORDER BY j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cron_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cron_health() TO authenticated, service_role;