-- Durable proof that a scheduled HTTP job actually reached its function.
--
-- The pg_net response table cannot be used for this: it holds one live row at a
-- time, has no index we are allowed to add (must be owner of _http_response),
-- and a single lookup seq-scans ~5 GB of bloat — 43 seconds measured. Reading it
-- is what made capture_cron_health() time out for every HTTP caller.
--
-- So the evidence now comes from the receiving end. cron_http_post stamps the
-- job name on the request; the shared cron-auth helper writes one cron_acks row
-- on every invocation, including the 401s that used to be invisible. A dispatch
-- with no ack after it means the function never ran.

CREATE TABLE IF NOT EXISTS public.cron_acks (
  id bigserial PRIMARY KEY,
  job_name text,
  fn text NOT NULL,
  authorized boolean NOT NULL DEFAULT true,
  at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_acks TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cron_acks_id_seq TO service_role;
ALTER TABLE public.cron_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages cron acks" ON public.cron_acks;
CREATE POLICY "service role manages cron acks"
  ON public.cron_acks FOR ALL
  USING (public.is_service_caller())
  WITH CHECK (public.is_service_caller());

CREATE INDEX IF NOT EXISTS cron_acks_job_at_idx ON public.cron_acks (job_name, at DESC);
CREATE INDEX IF NOT EXISTS cron_acks_fn_at_idx ON public.cron_acks (fn, at DESC);

-- Tell the function which job called it, so the ack can be matched.
CREATE OR REPLACE FUNCTION public.cron_http_post(_job_name text, _fn text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_base text;
  v_key  text;
  v_id   bigint;
BEGIN
  IF public.is_scheduler_paused() THEN
    RETURN NULL;
  END IF;

  SELECT rtrim(value #>> '{}', '/') INTO v_base
    FROM public.app_settings WHERE key = 'edge_functions_base_url';
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'edge_functions_base_url not configured';
  END IF;

  v_key := public.admin_get_service_role_key();

  SELECT net.http_post(
    url := v_base || '/' || _fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', coalesce(v_key, ''),
      'x-cron-job', _job_name
    ),
    body := coalesce(_payload, '{}'::jsonb) || jsonb_build_object('cron_job', _job_name, 'at', now())
  ) INTO v_id;

  INSERT INTO public.cron_runs (job_name, request_id, scheduled_at)
  VALUES (_job_name, v_id, now());

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_http_post(text, text, jsonb) TO service_role;

-- Health now reads acks, never pg_net.
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

  -- pg_cron never prunes its own history; 306k rows was making every read slow.
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
      -- Dispatched, but the function never acknowledged it, or refused it.
      OR (d.scheduled_at IS NOT NULL
          AND d.scheduled_at < now() - interval '5 minutes'
          AND (a.at IS NULL OR a.at < d.scheduled_at))
      OR a.authorized IS FALSE),
    now(),
    CASE WHEN a.authorized IS FALSE THEN 401
         WHEN a.at IS NOT NULL AND d.scheduled_at IS NOT NULL AND a.at >= d.scheduled_at THEN 200
         ELSE NULL END,
    CASE WHEN a.authorized IS FALSE THEN 'function refused the cron credential'
         WHEN d.scheduled_at IS NOT NULL
              AND d.scheduled_at < now() - interval '5 minutes'
              AND (a.at IS NULL OR a.at < d.scheduled_at)
           THEN 'dispatched but the function never ran'
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
