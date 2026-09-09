-- Why a snapshot: cron.job carries RLS (username = CURRENT_USER) and, called over
-- PostgREST as service_role, admin_cron_health() returns zero rows / times out —
-- so the watchdog panel silently claimed there were no scheduled jobs at all.
-- In-database it works, so an hourly job owned by postgres records the health of
-- every scheduled job into a table and the admin panel reads that instead.
CREATE TABLE IF NOT EXISTS public.cron_health_snapshot (
  jobid bigint PRIMARY KEY,
  jobname text NOT NULL,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  expected_interval_minutes integer,
  minutes_since numeric,
  stale boolean,
  captured_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_health_snapshot TO authenticated;
GRANT ALL ON public.cron_health_snapshot TO service_role;

ALTER TABLE public.cron_health_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read cron health" ON public.cron_health_snapshot;
CREATE POLICY "admins read cron health"
  ON public.cron_health_snapshot
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.capture_cron_health()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM public.cron_health_snapshot;

  INSERT INTO public.cron_health_snapshot (
    jobid, jobname, schedule, active, last_run_at, last_status, last_message,
    expected_interval_minutes, minutes_since, stale, captured_at
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
      OR coalesce(r.status, 'failed') NOT IN ('succeeded', 'running')),
    now()
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid
      AND d.start_time > now() - interval '14 days'
    ORDER BY d.start_time DESC
    LIMIT 1
  ) r ON true;

  SELECT count(*) INTO v_rows FROM public.cron_health_snapshot;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_cron_health() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-health-snapshot';
  PERFORM cron.schedule('cron-health-snapshot', '7 * * * *',
    $cmd$ SELECT public.capture_cron_health(); $cmd$);
END $$;

-- Seed immediately so the panel is not blank until the first hourly run.
DO $$
BEGIN
  INSERT INTO public.cron_health_snapshot (
    jobid, jobname, schedule, active, last_run_at, last_status, last_message,
    expected_interval_minutes, minutes_since, stale, captured_at
  )
  SELECT
    j.jobid, j.jobname::text, j.schedule::text, j.active,
    r.start_time, r.status::text, left(coalesce(r.return_message, ''), 300),
    public.cron_expected_interval_minutes(j.schedule),
    round(extract(epoch FROM (now() - r.start_time)) / 60.0, 1),
    (r.start_time IS NULL
      OR now() - r.start_time > (public.cron_expected_interval_minutes(j.schedule) * 3) * interval '1 minute'
      OR coalesce(r.status, 'failed') NOT IN ('succeeded', 'running')),
    now()
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    WHERE d.jobid = j.jobid AND d.start_time > now() - interval '14 days'
    ORDER BY d.start_time DESC LIMIT 1
  ) r ON true
  ON CONFLICT (jobid) DO NOTHING;
END $$;
