-- Re-points an existing scheduled job at public.cron_http_post while KEEPING the
-- schedule it already has (read straight from cron.job, never restated here), so
-- the call carries a valid credential and its real HTTP response is recorded.
-- cron.job is owned by postgres, so this has to be a definer function.
CREATE OR REPLACE FUNCTION public.repoint_cron_to_helper(_job_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_schedule text;
BEGIN
  IF NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT schedule::text INTO v_schedule FROM cron.job WHERE jobname = _job_name LIMIT 1;
  IF v_schedule IS NULL THEN
    RETURN format('%s: not scheduled', _job_name);
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = _job_name;
  PERFORM cron.schedule(
    _job_name,
    v_schedule,
    format(' SELECT public.cron_http_post(%L, %L); ', _job_name, _job_name)
  );

  RETURN format('%s: repointed, schedule preserved as %s', _job_name, v_schedule);
END;
$function$;

REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM anon;
REVOKE ALL ON FUNCTION public.repoint_cron_to_helper(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.repoint_cron_to_helper(text) TO service_role;
