-- Three live SQL functions still read the retired pro_visits table, so they
-- returned empty or never fired. Repoint them at visits / visit_ratings.

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
    SELECT assigned_pro_id, COUNT(*) * v_hours_per_visit AS hours
    FROM public.visits
    WHERE assigned_pro_id IS NOT NULL
      AND status = 'scheduled'
      AND scheduled_start >= now()
      AND scheduled_start < now() + interval '7 days'
    GROUP BY assigned_pro_id
  ) booked ON booked.assigned_pro_id = a.contractor_id;
END;
$function$;

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
  FROM public.visits v
  JOIN public.applicants a ON a.contractor_id = v.assigned_pro_id
  LEFT JOIN public.pro_capacity_stats_internal() cap ON cap.applicant_id = a.id
  WHERE v.user_id = p_user_id
    AND v.status = 'complete'
    AND v.assigned_pro_id IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.quarantine_flagged_low_rating()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stars integer;
  v_flagged boolean;
BEGIN
  v_stars := COALESCE(NEW.stars, NEW.rating);
  IF v_stars IS NULL OR v_stars > 3 THEN
    RETURN NEW;
  END IF;

  -- A Pro who flagged a condition and was declined (or got no answer) is
  -- protected. That record now lives on addon_requests, not pro_visits.
  SELECT true INTO v_flagged
  FROM public.addon_requests ar
  WHERE NEW.visit_id IS NOT NULL
    AND ar.job_id = NEW.visit_id
    AND ar.status IN ('declined', 'expired')
    AND ar.condition_note IS NOT NULL
  LIMIT 1;

  IF COALESCE(v_flagged, false) THEN
    NEW.excluded_from_average := true;
    NEW.admin_review_status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$;
