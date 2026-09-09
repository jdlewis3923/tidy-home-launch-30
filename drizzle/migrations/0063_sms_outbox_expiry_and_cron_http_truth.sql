-- 1. A parked text must be able to expire. Nothing wrote status 'canceled'
--    before this, so a 15-minute add-on link queued at 18:20 Saturday was
--    delivered Monday morning pointing at a request that died 38 hours earlier.
ALTER TABLE public.sms_outbox
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS sms_outbox_queued_expiry_idx
  ON public.sms_outbox (expires_at)
  WHERE status = 'queued';

-- 2. pg_cron 'succeeded' only means the dispatching SQL returned. Record the
--    request id of each scheduled HTTP call so the real response can be read.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  request_id bigint,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cron_runs_job_recent_idx
  ON public.cron_runs (job_name, scheduled_at DESC);

GRANT ALL ON public.cron_runs TO service_role;
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cron_http_post(_job_name text, _fn text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_key text;
  v_base text;
  v_req bigint;
BEGIN
  SELECT value #>> '{}' INTO v_base FROM public.app_settings WHERE key = 'edge_functions_base_url';
  IF v_base IS NULL OR length(v_base) = 0 THEN
    RAISE WARNING '[cron_http_post] edge_functions_base_url not set; skipping %', _fn;
    RETURN NULL;
  END IF;

  v_key := public.admin_get_service_role_key();
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE WARNING '[cron_http_post] service credential missing; skipping %', _fn;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := rtrim(v_base, '/') || '/' || _fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-cron-key', v_key
    ),
    body := coalesce(_payload, '{}'::jsonb),
    timeout_milliseconds := 25000
  ) INTO v_req;

  INSERT INTO public.cron_runs (job_name, request_id, context)
  VALUES (_job_name, v_req, jsonb_build_object('fn', _fn));

  DELETE FROM public.cron_runs WHERE scheduled_at < now() - interval '14 days';
  RETURN v_req;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[cron_http_post] % dispatch failed: %', _fn, sqlerrm;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.cron_http_post(text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cron_http_post(text, text, jsonb) TO service_role;

-- 3. The health snapshot carries the real HTTP outcome now.
ALTER TABLE public.cron_health_snapshot
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS http_error text,
  ADD COLUMN IF NOT EXISTS http_at timestamptz;

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
      -- A job that 401s or times out every single run used to report
      -- 'succeeded' forever. The response decides now.
      OR (h.status_code IS NOT NULL AND h.status_code >= 400)
      OR h.timed_out IS TRUE
      OR (h.status_code IS NULL AND h.error_msg IS NOT NULL)),
    now(),
    h.status_code,
    left(coalesce(h.error_msg, ''), 300),
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
  ) h ON true;

  SELECT count(*) INTO v_rows FROM public.cron_health_snapshot;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_cron_health() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM anon;
REVOKE ALL ON FUNCTION public.capture_cron_health() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.capture_cron_health() TO service_role;
