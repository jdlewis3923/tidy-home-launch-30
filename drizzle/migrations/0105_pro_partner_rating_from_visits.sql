CREATE OR REPLACE FUNCTION public.pro_partner_status(_applicant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT id, contractor_id, tier, coalesce(completed_visits,0) AS visits, avg_customer_rating, pro_since
    FROM public.applicants WHERE id = _applicant
  ), vr AS (
    SELECT avg(coalesce(r.stars, r.rating))::numeric AS avg_stars, count(*) AS n
    FROM public.visit_ratings r, a
    WHERE r.contractor_id = a.contractor_id AND r.verified AND NOT r.excluded_from_average
  ), first_visit AS (
    SELECT min(v.completed_at) AS at FROM public.visits v, a
    WHERE v.assigned_pro_id = a.contractor_id AND v.completed_at IS NOT NULL AND NOT v.is_redo
  ), redos AS (
    SELECT count(*) AS n FROM public.redo_requests r, a
    WHERE r.applicant_id = a.id AND r.status <> 'canceled' AND r.requested_at > now() - interval '60 days'
  ), x AS (
    SELECT a.*, CASE WHEN vr.n > 0 THEN round(vr.avg_stars, 2) ELSE a.avg_customer_rating END AS rating,
      coalesce(a.pro_since::timestamptz, first_visit.at) AS since, redos.n AS redo_n
    FROM a, vr, first_visit, redos
  )
  SELECT jsonb_build_object(
    'tier', tier, 'visits', visits, 'visits_needed', 50, 'visits_met', visits >= 50,
    'rating', rating, 'rating_met', coalesce(rating,0) >= 4.8,
    'days_active', coalesce(floor(extract(epoch FROM now() - since) / 86400)::int, 0),
    'days_met', coalesce(now() - since >= interval '60 days', false),
    'redos_60d', redo_n, 'redo_hold', redo_n > 2,
    'all_met', visits >= 50 AND coalesce(rating,0) >= 4.8 AND coalesce(now() - since >= interval '60 days', false) AND redo_n <= 2
  ) FROM x;
$$;

CREATE OR REPLACE FUNCTION public.pro_partner_try_promote(_applicant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; a record;
BEGIN
  s := public.pro_partner_status(_applicant);
  SELECT id, contractor_id, first_name, last_name, tier INTO a FROM public.applicants WHERE id = _applicant FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('promoted', false, 'reason', 'not_found'); END IF;
  IF a.tier = 'tier_2_pro_partner' THEN RETURN jsonb_build_object('promoted', false, 'reason', 'already', 'status', s); END IF;
  IF NOT coalesce((s->>'all_met')::boolean, false) THEN RETURN jsonb_build_object('promoted', false, 'reason', 'not_met', 'status', s); END IF;
  UPDATE public.applicants SET tier = 'tier_2_pro_partner', tier_advanced_at = now(), tier_readiness_status = 'promoted' WHERE id = _applicant;
  UPDATE public.visits SET contractor_pay_cents = contractor_pay_cents
   WHERE assigned_pro_id = a.contractor_id AND completed_at IS NULL AND contractor_pay_cents IS NOT NULL;
  INSERT INTO public.onboarding_events(applicant_id, event, metadata) VALUES (_applicant, 'tier_2_promoted', jsonb_build_object('rule', '50 visits · 4.8 · 60 days', 'status', s));
  INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, metadata)
  VALUES ('pro_partner_promoted', _applicant, coalesce(a.first_name,'') || ' ' || coalesce(left(a.last_name,1),'') || '. is now a Pro Partner', '10% raise applied automatically from the next visit', s);
  RETURN jsonb_build_object('promoted', true, 'status', s);
END $$;
REVOKE ALL ON FUNCTION public.pro_partner_try_promote(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_partner_try_promote(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pro_partner_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_partner_status(uuid) TO service_role;