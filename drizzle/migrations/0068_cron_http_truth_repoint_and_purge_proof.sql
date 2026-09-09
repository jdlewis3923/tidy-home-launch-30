-- Scheduled-job truth, part 2.
--
-- 0063 added cron_http_post() and 0064 added repoint_cron_to_helper(), but
-- nothing ever CALLED either one: every scheduled HTTP job still ran an inline
-- net.http_post, so cron_runs stayed empty and a job that 401s on every run
-- still reported "succeeded" and green. This migration:
--   1. Makes cron_runs keep the HTTP outcome itself, so the health read no
--      longer depends on net._http_response surviving pg_net retention.
--   2. Rewrites repoint_cron_to_helper() to derive the target function AND the
--      original payload from the job's own command, and to REFUSE any job that
--      is not a single plain HTTP dispatch (pure-SQL jobs such as
--      generate-recurring-visits-daily and cron-health-snapshot, and the
--      social arming job that selects post ids).
--   3. Actually repoints every eligible job.

-- 1 ------------------------------------------------------------------------
ALTER TABLE public.cron_runs
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS http_error text,
  ADD COLUMN IF NOT EXISTS timed_out boolean,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;

CREATE INDEX IF NOT EXISTS cron_runs_pending_idx
  ON public.cron_runs (request_id)
  WHERE responded_at IS NULL;

-- 2 ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repoint_cron_to_helper(_job_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_schedule text;
  v_command  text;
  v_fn       text;
  v_payload  text;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT schedule::text, command INTO v_schedule, v_command
    FROM cron.job WHERE jobname = _job_name LIMIT 1;
  IF v_schedule IS NULL THEN
    RETURN format('%s: not scheduled', _job_name);
  END IF;

  -- Already routed through the helper: nothing to do.
  IF v_command LIKE '%cron_http_post%' THEN
    RETURN format('%s: already recording', _job_name);
  END IF;

  -- A job that makes no HTTP call at all is pure SQL. Repointing it would
  -- replace real work with a POST to a function that does not exist — this is
  -- exactly how generate-recurring-visits-daily would have stopped generating
  -- visits. Refuse.
  IF v_command NOT LIKE '%net.http_post%' AND v_command NOT LIKE '%call_edge_function%' THEN
    RETURN format('%s: skipped, pure SQL job', _job_name);
  END IF;

  -- More than a plain dispatch (arming updates, CTEs, per-row bodies): the
  -- payload cannot be reproduced, so leave it alone.
  IF v_command ~* '(^|\s)(with|update|insert|delete)\s' OR v_command ~* 'from\s+due' THEN
    RETURN format('%s: skipped, not a plain dispatch', _job_name);
  END IF;

  -- Target function name: /functions/v1/<fn>, base_url || '/<fn>', or
  -- call_edge_function('<fn>', ...).
  v_fn := coalesce(
    substring(v_command from '/functions/v1/([a-zA-Z0-9_-]+)'),
    substring(v_command from '\|\|\s*''/([a-zA-Z0-9_-]+)'''),
    substring(v_command from 'call_edge_function\(\s*''([a-zA-Z0-9_-]+)''')
  );
  IF v_fn IS NULL THEN
    RETURN format('%s: skipped, target function not derivable', _job_name);
  END IF;

  -- Payload: a JSON literal in the command is carried over verbatim. A body
  -- built with jsonb_build_object is only safe to drop when it carries nothing
  -- but call metadata (source/at/time); anything else is real input.
  v_payload := substring(v_command from '''(\{[^'']*\})''');
  IF v_payload IS NULL THEN
    IF v_command ~* 'body\s*:?=\s*jsonb_build_object' THEN
      IF v_command ~* 'jsonb_build_object\(\s*(''(source|at|time)''\s*,\s*[^,)]+\s*,?\s*)+\)' THEN
        v_payload := '{}';
      ELSE
        RETURN format('%s: skipped, payload carries real input', _job_name);
      END IF;
    ELSE
      v_payload := '{}';
    END IF;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = _job_name;
  PERFORM cron.schedule(
    _job_name,
    v_schedule,
    format(' SELECT public.cron_http_post(%L, %L, %L::jsonb); ', _job_name, v_fn, v_payload)
  );

  RETURN format('%s: repointed to %s payload %s, schedule %s', _job_name, v_fn, v_payload, v_schedule);
END;
$function$;

REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM anon;
REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.repoint_cron_to_helper(text) TO service_role;

-- 3 ------------------------------------------------------------------------
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

  -- A dispatch that never produced a response row at all (pg_net dropped it,
  -- or the request was never made) is a failure too, once it is old enough.
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
      -- The dispatching SQL succeeding says nothing about the function. The
      -- recorded response decides.
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
    -- cron_runs only: purge-proof, because the outcome is copied above.
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

-- 4. Repoint for real. Every eligible job, one report line each.
DO $$
DECLARE
  j record;
  msg text;
BEGIN
  FOR j IN SELECT jobname::text AS name FROM cron.job ORDER BY jobname LOOP
    SELECT public.repoint_cron_to_helper(j.name) INTO msg;
    RAISE NOTICE '%', msg;
  END LOOP;
END $$;
