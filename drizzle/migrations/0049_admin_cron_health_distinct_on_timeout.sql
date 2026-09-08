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
SET statement_timeout TO '30s'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  -- cron.job_run_details is large and cannot be indexed by us (owned by the
  -- platform), so make exactly one pass over it and allow it the time it needs.
  RETURN QUERY
  WITH lastrun AS (
    SELECT DISTINCT ON (d.jobid)
      d.jobid, d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
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