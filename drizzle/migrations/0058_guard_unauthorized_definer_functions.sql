CREATE OR REPLACE FUNCTION public.change_badge_status(_applicant_id uuid, _new_status text, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _old_status text;
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF _new_status NOT IN ('active','suspended','revoked','not_issued') THEN
    RAISE EXCEPTION 'Invalid badge status: %', _new_status;
  END IF;

  SELECT badge_status INTO _old_status FROM public.applicants WHERE id = _applicant_id;
  IF _old_status IS NULL THEN
    RAISE EXCEPTION 'Applicant not found: %', _applicant_id;
  END IF;

  UPDATE public.applicants SET badge_status = _new_status WHERE id = _applicant_id;

  INSERT INTO public.badge_status_log (applicant_id, old_status, new_status, changed_by, note)
  VALUES (_applicant_id, _old_status, _new_status, auth.uid(), _note);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_pro_addon_request_stats()
RETURNS TABLE(applicant_id uuid, contractor_id uuid, requests integer, approvals integer,
              completed_visits integer, request_rate numeric, approval_rate numeric,
              fleet_median_rate numeric, over_3x_median boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      a.id AS applicant_id,
      a.contractor_id,
      COALESCE(r.requests, 0)::integer AS requests,
      COALESCE(r.approvals, 0)::integer AS approvals,
      GREATEST(COALESCE(a.completed_visits, 0), 0)::integer AS completed_visits,
      ROUND(COALESCE(r.requests, 0)::numeric / GREATEST(COALESCE(a.completed_visits, 0), 1), 3) AS request_rate,
      CASE WHEN COALESCE(r.requests, 0) = 0 THEN NULL
           ELSE ROUND(COALESCE(r.approvals, 0)::numeric / r.requests, 3) END AS approval_rate
    FROM public.applicants a
    LEFT JOIN (
      SELECT ar.pro_id,
             COUNT(*)::int AS requests,
             COUNT(*) FILTER (WHERE ar.status = 'approved')::int AS approvals
      FROM public.addon_requests ar
      GROUP BY ar.pro_id
    ) r ON r.pro_id = a.contractor_id
    WHERE a.contractor_id IS NOT NULL
  ), med AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY b.request_rate) AS m
    FROM base b WHERE b.completed_visits > 0
  )
  SELECT b.applicant_id, b.contractor_id, b.requests, b.approvals, b.completed_visits,
         b.request_rate, b.approval_rate, med.m,
         (med.m IS NOT NULL AND med.m > 0 AND b.request_rate > 3 * med.m)
  FROM base b CROSS JOIN med;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_cron_health()
RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean,
              last_run_at timestamp with time zone, last_status text, last_message text,
              expected_interval_minutes integer, minutes_since numeric, stale boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH lastrun AS (
    SELECT DISTINCT ON (d.jobid) d.jobid, d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
  )
  SELECT
    j.jobid, j.jobname::text, j.schedule::text, j.active,
    r.start_time, r.status::text, left(coalesce(r.return_message, ''), 300),
    public.cron_expected_interval_minutes(j.schedule),
    round(extract(epoch FROM (now() - r.start_time)) / 60.0, 1),
    (r.start_time IS NULL
      OR now() - r.start_time > (public.cron_expected_interval_minutes(j.schedule) * 3) * interval '1 minute'
      OR coalesce(r.status, 'failed') NOT IN ('succeeded','running'))
  FROM cron.job j
  LEFT JOIN lastrun r ON r.jobid = j.jobid
  ORDER BY j.jobname;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.nextval(seq_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF seq_name NOT IN ('pro_number_seq') THEN
    RAISE EXCEPTION 'sequence not allowed: %', seq_name;
  END IF;
  RETURN nextval(('public.' || seq_name)::regclass);
END;
$fn$;

DO $do$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'intake_load';
  IF def IS NOT NULL AND position('length(_token) < 10' in def) > 0 THEN
    EXECUTE replace(def, 'length(_token) < 10', 'length(_token) < 20');
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'intake_save';
  IF def IS NOT NULL AND position('SELECT * INTO r FROM public.pro_kit WHERE token = _token;' in def) > 0 THEN
    EXECUTE replace(
      def,
      'SELECT * INTO r FROM public.pro_kit WHERE token = _token;',
      'IF _token IS NULL OR length(_token) < 20 THEN RETURN jsonb_build_object(''state'',''not_found''); END IF; SELECT * INTO r FROM public.pro_kit WHERE token = _token;'
    );
  END IF;
END $do$;