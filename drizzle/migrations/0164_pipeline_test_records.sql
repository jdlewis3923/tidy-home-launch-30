ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.contractor_pipeline.is_test IS 'Owner/test Pro. Skipped by proof gate and every pipeline migration; never counted (capacity, spend lock, money at risk, hire triggers, Pro counts) and never assignable to customer jobs.';

CREATE OR REPLACE FUNCTION public.pipeline_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.is_test AND NEW.proof_approved_at IS NULL AND public.pipeline_stage_index(NEW.stage) >= public.pipeline_stage_index('background')
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage OR OLD.proof_approved_at IS NOT NULL OR OLD.is_test) THEN
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;
  IF coalesce(current_setting('tidy.pipeline_move', true), '') = 'on' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage <> 'applied' OR NEW.state <> 'open' OR NEW.archived OR NEW.activated_at IS NOT NULL OR NEW.is_test THEN
      RAISE EXCEPTION 'pipeline: new candidates start at applied' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.archived IS DISTINCT FROM OLD.archived OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.spend_confirmed_at IS DISTINCT FROM OLD.spend_confirmed_at OR NEW.is_test IS DISTINCT FROM OLD.is_test
     OR NEW.proof_approved_at IS DISTINCT FROM OLD.proof_approved_at OR NEW.proof_approved_by IS DISTINCT FROM OLD.proof_approved_by THEN
    RAISE EXCEPTION 'pipeline: stage can only change through Advance, Hold, Decline, Withdraw or Override'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_spend_lock_holder(_service text, _except uuid)
RETURNS TABLE(applicant_id uuid, name text, stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), p.stage
    FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
   WHERE p.service = _service AND p.applicant_id <> _except AND NOT p.archived AND NOT p.is_test
     AND (p.stage IN ('background','insured') OR (p.stage = 'active' AND p.activated_at IS NULL))
   ORDER BY p.stage_entered_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pipeline_money_at_risk()
RETURNS TABLE(service text, spend_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY
  SELECT coalesce(p.service, 'unknown'), sum(s.amount_cents)::bigint
    FROM public.contractor_spend s JOIN public.contractor_pipeline p ON p.applicant_id = s.applicant_id
   WHERE NOT p.archived AND NOT p.is_test AND p.activated_at IS NULL
   GROUP BY 1;
END $$;

-- Test Pros are never assignable: their day claims never go live and no job can be assigned to them.
CREATE OR REPLACE FUNCTION public.pipeline_pro_assignable(_applicant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contractor_pipeline p
     WHERE p.applicant_id = _applicant_id AND NOT p.archived AND NOT p.is_test AND p.state <> 'lapsed'
       AND p.coi_expiry_date IS NOT NULL AND p.coi_expiry_date > current_date
       AND p.probation_paused_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_is_test_pro(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.applicants a JOIN public.contractor_pipeline p ON p.applicant_id = a.id
                  WHERE a.contractor_id = _uid AND p.is_test)
$$;

CREATE OR REPLACE FUNCTION public.sched_active_pro_count(_s service_type)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT pro_user_id)::int FROM public.pro_day_claims
   WHERE service = _s AND status IN ('active','dropping') AND NOT public.pipeline_is_test_pro(pro_user_id)
$$;

CREATE OR REPLACE FUNCTION public.pro_capacity_stats_internal()
RETURNS TABLE(applicant_id uuid, preferred_by_count integer, booked_pct numeric, high_demand boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pref_threshold integer; v_pct_threshold numeric; v_hours_per_visit numeric; v_weekly_capacity numeric;
BEGIN
  SELECT COALESCE((value->>'preferred_by_threshold')::integer, 15), COALESCE((value->>'booked_pct_threshold')::numeric, 0.85),
         COALESCE((value->>'assumed_hours_per_visit')::numeric, 2), COALESCE((value->>'weekly_capacity_hours')::numeric, 40)
    INTO v_pref_threshold, v_pct_threshold, v_hours_per_visit, v_weekly_capacity
    FROM public.app_settings WHERE key = 'preferred_pro';
  v_pref_threshold := COALESCE(v_pref_threshold, 15); v_pct_threshold := COALESCE(v_pct_threshold, 0.85);
  v_hours_per_visit := COALESCE(v_hours_per_visit, 2); v_weekly_capacity := COALESCE(v_weekly_capacity, 40);
  RETURN QUERY
  SELECT a.id, COALESCE(pref.cnt, 0)::integer,
    ROUND(LEAST(COALESCE(booked.hours, 0) / NULLIF(v_weekly_capacity, 0), 1) * 100, 1),
    (COALESCE(pref.cnt, 0) >= v_pref_threshold OR COALESCE(booked.hours, 0) / NULLIF(v_weekly_capacity, 0) > v_pct_threshold)
  FROM public.applicants a
  LEFT JOIN (SELECT preferred_pro_id, COUNT(*) AS cnt FROM public.subscriptions
              WHERE preferred_pro_id IS NOT NULL AND status = 'active' GROUP BY preferred_pro_id) pref ON pref.preferred_pro_id = a.id
  LEFT JOIN (SELECT assigned_pro_id, COUNT(*) * v_hours_per_visit AS hours FROM public.visits
              WHERE assigned_pro_id IS NOT NULL AND status = 'scheduled' AND scheduled_start >= now() AND scheduled_start < now() + interval '7 days'
              GROUP BY assigned_pro_id) booked ON booked.assigned_pro_id = a.contractor_id
  WHERE NOT EXISTS (SELECT 1 FROM public.contractor_pipeline tp WHERE tp.applicant_id = a.id AND tp.is_test);
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_block_uninsured_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid; v_name text; v_col text := TG_ARGV[0]; v_paused boolean; v_test boolean;
BEGIN
  IF v_col = 'visit' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    SELECT id, first_name INTO v_app, v_name FROM public.applicants WHERE contractor_id = NEW.assigned_pro_id ORDER BY created_at DESC LIMIT 1;
  ELSIF v_col = 'subscription' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    v_app := NEW.assigned_pro_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  ELSE
    IF NOT coalesce(NEW.active, false) OR NEW.applicant_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.applicant_id IS NOT DISTINCT FROM OLD.applicant_id AND coalesce(OLD.active, false) THEN RETURN NEW; END IF;
    v_app := NEW.applicant_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  END IF;

  IF v_app IS NOT NULL AND public.pipeline_pro_assignable(v_app) THEN RETURN NEW; END IF;
  SELECT probation_paused_at IS NOT NULL, is_test INTO v_paused, v_test FROM public.contractor_pipeline WHERE applicant_id = v_app;

  IF coalesce(v_test, false) THEN
    IF v_col = 'route' THEN NEW.active := false; ELSE NEW.assigned_pro_id := NULL; END IF;
    IF public.is_service_caller() THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Cannot assign %: test Pro accounts never receive customer jobs', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
  END IF;

  IF public.is_service_caller() THEN
    INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
    VALUES ('insurance_action', 'action', 'insurance',
      'Assignment blocked — ' || coalesce(v_name, 'Pro') || CASE WHEN v_paused THEN ' is paused after 2 probation redos' ELSE ' has no valid insurance' END,
      CASE WHEN v_paused THEN 'A job was left unassigned because this Pro''s new assignments are paused.' ELSE 'A job was left unassigned because this Pro''s certificate is lapsed or missing.' END,
      'Open pipeline', '/admin/pipeline', 'assign_block:' || coalesce(v_app::text, 'unknown') || ':' || current_date,
      jsonb_build_object('applicant_id', v_app))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF v_col = 'route' THEN NEW.active := false; ELSE NEW.assigned_pro_id := NULL; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(v_paused, false) THEN
    RAISE EXCEPTION 'Cannot assign %: new assignments are paused after 2 probation redos', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
  END IF;
  RAISE EXCEPTION 'Cannot assign %: insurance certificate is lapsed or missing', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
END $$;

DROP FUNCTION IF EXISTS public.pipeline_board();
CREATE FUNCTION public.pipeline_board()
RETURNS TABLE(applicant_id uuid, name text, city text, service text, stage text, state text, days_in_stage integer, hold_callback_date date, hold_reason text, callback_overdue boolean, activated boolean, previously_declined text, overridden boolean, is_test boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY
  SELECT p.applicant_id,
    trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')),
    coalesce(nullif(a.city_or_zip, ''), a.zip),
    p.service, p.stage, p.state,
    greatest(0, (current_date - p.stage_entered_at::date))::int,
    p.hold_callback_date, p.hold_reason,
    (p.state = 'hold' AND p.hold_callback_date <= current_date),
    p.activated_at IS NOT NULL,
    (SELECT 'Previously declined ' || to_char(coalesce(o.archived_at, o.updated_at), 'FMDD Mon') || ' — ' ||
            lower(coalesce(CASE WHEN o.decline_reason = 'Other' THEN o.decline_note END, o.decline_reason, 'withdrew'))
       FROM public.contractor_pipeline o JOIN public.applicants oa ON oa.id = o.applicant_id
      WHERE o.archived AND o.applicant_id <> p.applicant_id
        AND ((coalesce(a.email,'') <> '' AND lower(oa.email) = lower(a.email))
          OR (length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')) >= 10
              AND right(regexp_replace(coalesce(oa.phone,''), '\D', '', 'g'), 10) = right(regexp_replace(a.phone, '\D', '', 'g'), 10)))
      ORDER BY o.archived_at DESC NULLS LAST LIMIT 1),
    EXISTS (SELECT 1 FROM public.contractor_stage_events e WHERE e.applicant_id = p.applicant_id AND e.kind = 'override'),
    p.is_test
  FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
  WHERE NOT p.archived;
END $$;
REVOKE ALL ON FUNCTION public.pipeline_board() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pipeline_board() TO authenticated, service_role;