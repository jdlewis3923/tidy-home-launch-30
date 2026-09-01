-- Preferred Pro (preference only — never an assignment)

-- 1. Store the preference on the subscription.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS preferred_pro_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_preferred_pro_id
  ON public.subscriptions (preferred_pro_id) WHERE preferred_pro_id IS NOT NULL;

-- 2. Configurable thresholds + capacity assumptions in app_settings.
INSERT INTO public.app_settings (key, value)
VALUES (
  'preferred_pro',
  jsonb_build_object(
    'preferred_by_threshold', 15,
    'booked_pct_threshold', 0.85,
    'assumed_hours_per_visit', 2,
    'weekly_capacity_hours', 40
  )
)
ON CONFLICT (key) DO NOTHING;

-- 3. Capacity stats per pro: how many active subscriptions prefer them, and
--    an approximate booked-hours utilization from scheduled pro_visits in the
--    next 7 days (pro_visits has no duration field, so we use the
--    assumed_hours_per_visit / weekly_capacity_hours settings above).
--    NOTE: pro_visits.contractor_id stores the auth.users id (per
--    applicants.contractor_id), NOT applicants.id — joins below reflect that.
CREATE OR REPLACE FUNCTION public.get_pro_capacity_stats()
RETURNS TABLE (
  applicant_id uuid,
  preferred_by_count integer,
  booked_pct numeric,
  high_demand boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_pro_capacity_stats() TO authenticated;

-- 4. Pros this customer has previously had complete a job, for the "Preferred
--    Pro" dropdown, with the high-demand capacity flag attached.
CREATE OR REPLACE FUNCTION public.get_customer_preferred_pro_options(p_user_id uuid)
RETURNS TABLE (
  pro_id uuid,
  first_name text,
  last_name text,
  preferred_by_count integer,
  high_demand boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  LEFT JOIN public.get_pro_capacity_stats() cap ON cap.applicant_id = a.id
  WHERE v.user_id = p_user_id
    AND pv.status = 'complete'
    AND pv.contractor_id IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_preferred_pro_options(uuid) TO authenticated;
