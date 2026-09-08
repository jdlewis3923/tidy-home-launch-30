-- SECURITY HARDENING PHASE 0 — authorization only. No pricing, pay, or copy changes.

-- (1) pro_coi_state: guard _pro against the caller.
CREATE OR REPLACE FUNCTION public.pro_coi_state(_pro uuid)
 RETURNS TABLE(status text, carrier text, policy_number text, expires_at date, certificate_path text, can_work boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    current_user = 'service_role'
    OR auth.uid() = _pro
    OR public.has_role(auth.uid(), 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT ci.* FROM public.contractor_insurance ci
    WHERE ci.contractor_id = _pro
    ORDER BY ci.expiration_date DESC NULLS LAST, ci.created_at DESC
    LIMIT 1
  )
  SELECT
    CASE
      WHEN l.id IS NULL THEN 'none'
      WHEN l.verification_status IN ('pending_verification','not_started','update_requested') THEN 'under_review'
      WHEN l.expiration_date IS NULL THEN 'under_review'
      WHEN l.expiration_date < CURRENT_DATE THEN 'expired'
      WHEN l.expiration_date < CURRENT_DATE + 30 THEN 'expiring'
      WHEN l.verification_status IN ('verified','waived') THEN 'active'
      ELSE 'under_review'
    END::text,
    l.carrier_name, l.policy_number, l.expiration_date, l.certificate_path,
    (l.id IS NOT NULL AND l.expiration_date IS NOT NULL AND l.expiration_date >= CURRENT_DATE
     AND l.verification_status IN ('verified','waived','pending_verification'))
  FROM (SELECT 1) one LEFT JOIN latest l ON true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.pro_coi_state(uuid) FROM anon;

-- (2) customers_needing_attention: admin-only in the body.
CREATE OR REPLACE FUNCTION public.customers_needing_attention()
 RETURNS TABLE(subscription_id uuid, user_id uuid, first_name text, last_name text, monthly_total_cents integer, preferred_pro_id uuid, retired_price boolean, missing_pro boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (current_user = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  select
    s.id as subscription_id,
    s.user_id,
    p.first_name,
    p.last_name,
    s.monthly_total_cents,
    s.preferred_pro_id,
    not exists (
      select 1 from public.stripe_catalog sc
      where sc.active = true
        and sc.price_cents = s.monthly_total_cents
    ) as retired_price,
    (s.preferred_pro_id is null) as missing_pro
  from public.subscriptions s
  left join public.profiles p on p.user_id = s.user_id
  where s.status = 'active'
    and (
      s.preferred_pro_id is null
      or not exists (
        select 1 from public.stripe_catalog sc
        where sc.active = true
          and sc.price_cents = s.monthly_total_cents
      )
    )
  order by s.monthly_total_cents desc, p.last_name, p.first_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.customers_needing_attention() FROM anon;

-- (3) Capacity stats: internal full-fleet helper (no public execute) +
--     public wrapper that returns only the caller's own row unless admin.
CREATE OR REPLACE FUNCTION public.pro_capacity_stats_internal()
 RETURNS TABLE(applicant_id uuid, preferred_by_count integer, booked_pct numeric, high_demand boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pref_threshold integer;
  v_pct_threshold numeric;
  v_hours_per_visit numeric;
  v_weekly_capacity numeric;
BEGIN
  SELECT
    COALESCE((value->>'preferred_by_threshold')::integer, 15),
    COALESCE((value->>'booked_pct_threshold')::numeric, 0.85),
    COALESCE((value->>'assumed_hours_per_visit')::numeric, 2),
    COALESCE((value->>'weekly_capacity_hours')::numeric, 40)
  INTO v_pref_threshold, v_pct_threshold, v_hours_per_visit, v_weekly_capacity
  FROM public.app_settings WHERE key = 'preferred_pro';

  v_pref_threshold := COALESCE(v_pref_threshold, 15);
  v_pct_threshold := COALESCE(v_pct_threshold, 0.85);
  v_hours_per_visit := COALESCE(v_hours_per_visit, 2);
  v_weekly_capacity := COALESCE(v_weekly_capacity, 40);

  RETURN QUERY
  SELECT
    a.id AS applicant_id,
    COALESCE(pref.cnt, 0)::integer AS preferred_by_count,
    ROUND(LEAST(COALESCE(booked.hours, 0) / NULLIF(v_weekly_capacity, 0), 1) * 100, 1) AS booked_pct,
    (COALESCE(pref.cnt, 0) >= v_pref_threshold
      OR COALESCE(booked.hours, 0) / NULLIF(v_weekly_capacity, 0) > v_pct_threshold) AS high_demand
  FROM public.applicants a
  LEFT JOIN (
    SELECT preferred_pro_id, COUNT(*) AS cnt
    FROM public.subscriptions
    WHERE preferred_pro_id IS NOT NULL AND status = 'active'
    GROUP BY preferred_pro_id
  ) pref ON pref.preferred_pro_id = a.id
  LEFT JOIN (
    SELECT contractor_id, COUNT(*) * v_hours_per_visit AS hours
    FROM public.pro_visits
    WHERE contractor_id IS NOT NULL
      AND status = 'scheduled'
      AND scheduled_at >= now()
      AND scheduled_at < now() + interval '7 days'
    GROUP BY contractor_id
  ) booked ON booked.contractor_id = a.contractor_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pro_capacity_stats_internal() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pro_capacity_stats_internal() FROM anon;
REVOKE ALL ON FUNCTION public.pro_capacity_stats_internal() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pro_capacity_stats_internal() TO service_role;

CREATE OR REPLACE FUNCTION public.get_pro_capacity_stats()
 RETURNS TABLE(applicant_id uuid, preferred_by_count integer, booked_pct numeric, high_demand boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN QUERY SELECT * FROM public.pro_capacity_stats_internal();
  ELSIF auth.uid() IS NOT NULL THEN
    -- A signed-in Pro may see only their own capacity row.
    RETURN QUERY
      SELECT s.* FROM public.pro_capacity_stats_internal() s
      WHERE s.applicant_id IN (
        SELECT a.id FROM public.applicants a WHERE a.contractor_id = auth.uid()
      );
  ELSE
    RAISE EXCEPTION 'not authorized';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_pro_capacity_stats() FROM anon;

-- get_customer_preferred_pro_options must keep working: use the internal
-- helper so the customer's own Pro list still shows high_demand.
CREATE OR REPLACE FUNCTION public.get_customer_preferred_pro_options(p_user_id uuid)
 RETURNS TABLE(pro_id uuid, first_name text, last_name text, preferred_by_count integer, high_demand boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    a.id AS pro_id,
    a.first_name,
    a.last_name,
    cap.preferred_by_count,
    cap.high_demand
  FROM public.pro_visits pv
  JOIN public.visits v ON v.jobber_visit_id = pv.jobber_visit_id
  JOIN public.applicants a ON a.contractor_id = pv.contractor_id
  LEFT JOIN public.pro_capacity_stats_internal() cap ON cap.applicant_id = a.id
  WHERE v.user_id = p_user_id
    AND pv.status = 'complete'
    AND pv.contractor_id IS NOT NULL;
END;
$function$;

-- (6) visits: column-level privileges. Pay columns leave the Data API entirely;
-- Pros read pay through the SECURITY DEFINER whitelist pro_get_visits.
REVOKE SELECT ON public.visits FROM authenticated;
REVOKE SELECT ON public.visits FROM anon;
GRANT SELECT (
  id, user_id, subscription_id, service, visit_date, time_window, status, notes,
  jobber_job_id, created_at, updated_at, jobber_visit_id, crew_name, assigned_pro_id,
  scheduled_start, scheduled_end, service_type, street, zip, customer_first_name,
  access_notes, gate_code, pet_notes, parking_notes, on_my_way_at, completed_at,
  is_sample, size_tier, cadence, surcharge_applied, visit_kind, paid_in_full_reason
) ON public.visits TO authenticated;

-- (6b) the pay schedule itself is not a customer-callable function.
REVOKE EXECUTE ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.pro_visit_pay_cents(text, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.pro_visit_pay_cents(text, text, text) FROM anon;

-- (7) addon_requests: the off-session charge token is not readable over the API.
REVOKE SELECT ON public.addon_requests FROM authenticated;
REVOKE SELECT ON public.addon_requests FROM anon;
GRANT SELECT (
  id, job_id, pro_visit_id, pro_id, customer_id, addon_id, addon_key, addon_name,
  condition_note, photo_url, status, amount_cents, pro_pay_cents, minutes_estimate,
  stripe_payment_intent_id, stripe_invoice_item_id, requested_at, expires_at, responded_at
) ON public.addon_requests TO authenticated;

-- (8) profiles update own: validate the NEW row too.
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- (9) visit_ratings: no unauthenticated write path. Ratings are only created by
-- submit-visit-rating, which resolves contractor_id from a real visit row and
-- never trusts a caller-supplied contractor_id.
DROP POLICY IF EXISTS visit_ratings_anon_insert ON public.visit_ratings;
REVOKE INSERT ON public.visit_ratings FROM anon;
REVOKE INSERT ON public.visit_ratings FROM authenticated;