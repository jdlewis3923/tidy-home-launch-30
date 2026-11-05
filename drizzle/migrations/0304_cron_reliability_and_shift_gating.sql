ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS fn text, ADD COLUMN IF NOT EXISTS payload jsonb, ADD COLUMN IF NOT EXISTS attempt integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS retried_at timestamptz;

CREATE OR REPLACE FUNCTION public.cron_dispatch_raw(_job_name text, _fn text, _payload jsonb, _attempt integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','net' AS $$
DECLARE v_base text; v_key text; v_id bigint;
BEGIN
  SELECT rtrim(value #>> '{}', '/') INTO v_base FROM public.app_settings WHERE key = 'edge_functions_base_url';
  IF v_base IS NULL THEN RAISE EXCEPTION 'edge_functions_base_url not configured'; END IF;
  v_key := public.admin_get_service_role_key();
  SELECT net.http_post(
    url := v_base || '/' || _fn,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-key',coalesce(v_key,''),'x-cron-job',_job_name),
    body := coalesce(_payload,'{}'::jsonb) || jsonb_build_object('cron_job',_job_name,'at',now(),'attempt',_attempt),
    timeout_milliseconds := 30000
  ) INTO v_id;
  INSERT INTO public.cron_runs (job_name, request_id, scheduled_at, fn, payload, attempt)
  VALUES (_job_name, v_id, now(), _fn, coalesce(_payload,'{}'::jsonb), _attempt);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.cron_dispatch_raw(text,text,jsonb,integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cron_retry_critical()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','net' AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (cr.job_name) cr.*
    FROM public.cron_runs cr
    WHERE cr.job_name IN ('connecteam-paperwork-15min','connecteam-visit-reports-10min','jobber-reconcile-nightly','pro-pay-statements-friday','admin-alert-dispatch')
      AND cr.scheduled_at > now() - interval '2 hours'
    ORDER BY cr.job_name, cr.scheduled_at DESC
  LOOP
    CONTINUE WHEN r.attempt <> 1 OR r.retried_at IS NOT NULL OR r.fn IS NULL;
    IF EXISTS (SELECT 1 FROM net._http_response h WHERE h.id = r.request_id
               AND (h.timed_out OR h.error_msg IS NOT NULL OR coalesce(h.status_code,0) >= 500)) THEN
      UPDATE public.cron_runs SET retried_at = now() WHERE id = r.id;
      PERFORM public.cron_dispatch_raw(r.job_name, r.fn, r.payload, 2);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cron_retry_critical() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retire_signing_selftest_if_signed()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'signing_selftest_retired') THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.pro_pay_profiles WHERE connecteam_user_id = 31157941 AND agreement_signed_at IS NOT NULL) THEN
    BEGIN PERFORM cron.unschedule('signing-selftest-nightly'); EXCEPTION WHEN OTHERS THEN NULL; END;
    INSERT INTO public.app_settings (key, value) VALUES ('signing_selftest_retired', to_jsonb(now())) ON CONFLICT (key) DO NOTHING;
    RETURN true;
  END IF;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.retire_signing_selftest_if_signed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_signing_selftest_if_signed() TO service_role;

CREATE OR REPLACE FUNCTION public.cron_http_post(_job_name text, _fn text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','net' AS $$
BEGIN
  IF public.is_scheduler_paused() THEN RETURN NULL; END IF;
  BEGIN PERFORM public.cron_retry_critical(); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'cron retry failed: %', sqlerrm; END;
  IF _job_name = 'signing-selftest-nightly' AND public.retire_signing_selftest_if_signed() THEN RETURN NULL; END IF;
  RETURN public.cron_dispatch_raw(_job_name, _fn, _payload, 1);
END $$;

CREATE OR REPLACE FUNCTION public.cron_missed_twice_check()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','net' AS $$
DECLARE r record; n integer := 0;
BEGIN
  IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'not authorized'; END IF;
  FOR r IN
    WITH runs AS (
      SELECT cr.job_name,
        (EXISTS (SELECT 1 FROM net._http_response h WHERE h.id = cr.request_id AND (h.timed_out OR h.error_msg IS NOT NULL OR coalesce(h.status_code,0) >= 500))
         AND NOT EXISTS (SELECT 1 FROM public.cron_runs rr JOIN net._http_response h2 ON h2.id = rr.request_id
                         WHERE rr.job_name = cr.job_name AND rr.attempt = 2 AND rr.scheduled_at > cr.scheduled_at
                           AND rr.scheduled_at < cr.scheduled_at + interval '30 minutes'
                           AND NOT h2.timed_out AND h2.error_msg IS NULL AND coalesce(h2.status_code,0) < 500)) AS missed,
        row_number() OVER (PARTITION BY cr.job_name ORDER BY cr.scheduled_at DESC) rn
      FROM public.cron_runs cr
      WHERE cr.attempt = 1 AND cr.scheduled_at > now() - interval '5 hours'
    )
    SELECT job_name, bool_and(missed) AS both_missed, count(*) c FROM runs WHERE rn <= 2 GROUP BY job_name
  LOOP
    IF r.c = 2 AND r.both_missed THEN
      IF NOT EXISTS (SELECT 1 FROM public.admin_alerts WHERE dedupe_key = 'cron-missed-twice:' || r.job_name AND resolved_at IS NULL) THEN
        DELETE FROM public.admin_alerts WHERE dedupe_key = 'cron-missed-twice:' || r.job_name;
        INSERT INTO public.admin_alerts (alert_type, dedupe_key, level, tier, category, title, body, context)
        VALUES ('cron_missed_runs', 'cron-missed-twice:' || r.job_name, 'warning', 'digest', 'operations',
                'Scheduled job missed 2 runs in a row: ' || r.job_name,
                'The last two runs did not reach their function (timeout or error). It keeps retrying on schedule.',
                jsonb_build_object('job_name', r.job_name, 'at', now()));
        n := n + 1;
      END IF;
    ELSE
      UPDATE public.admin_alerts SET resolved_at = now() WHERE dedupe_key = 'cron-missed-twice:' || r.job_name AND resolved_at IS NULL;
    END IF;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cron_missed_twice_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_missed_twice_check() TO service_role;

CREATE OR REPLACE FUNCTION public.assign_jobber_visit_pro(_visit uuid, _override bigint DEFAULT NULL::bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v public.jobber_visits; chosen bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('jobber-pro-assignment',0));
  SELECT * INTO v FROM public.jobber_visits WHERE id=_visit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'visit not found'; END IF;
  IF v.is_test THEN chosen:=31157330;
  ELSE
    SELECT p.connecteam_user_id INTO chosen FROM public.jobber_service_pro_pool p
    JOIN public.pro_pay_profiles pp ON pp.connecteam_user_id = p.connecteam_user_id
    WHERE p.active AND p.service_line=v.service_line
      AND pp.paperwork_complete
      AND (pp.coi_expires_at IS NULL OR pp.coi_expires_at > v.start_at)
      AND NOT EXISTS(SELECT 1 FROM public.jobber_visits b WHERE b.id<>v.id AND b.deleted_at IS NULL
        AND b.connecteam_user_id=p.connecteam_user_id AND b.start_at<greatest(v.end_at,v.start_at+interval '1 minute')
        AND greatest(b.end_at,b.start_at+interval '1 minute')>v.start_at)
    ORDER BY p.priority,p.id LIMIT 1;
  END IF;
  UPDATE public.jobber_visits SET connecteam_user_id=chosen WHERE id=_visit;
  RETURN chosen;
END $$;