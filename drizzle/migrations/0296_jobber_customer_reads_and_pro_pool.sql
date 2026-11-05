CREATE TABLE IF NOT EXISTS public.jobber_service_pro_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_line text NOT NULL,
  connecteam_user_id bigint NOT NULL,
  pro_name text,
  priority integer NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_line, connecteam_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobber_service_pro_pool TO authenticated;
GRANT ALL ON public.jobber_service_pro_pool TO service_role;
ALTER TABLE public.jobber_service_pro_pool ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage pro pool" ON public.jobber_service_pro_pool FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.jobber_service_pro_pool (service_line, connecteam_user_id, pro_name, priority)
SELECT service_line, connecteam_user_id, pro_name, 1 FROM public.jobber_service_pros WHERE connecteam_user_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO public.jobber_service_pro_pool (service_line, connecteam_user_id, pro_name, priority)
VALUES ('cleaning', 31157941, 'Susan Horn', 1), ('cleaning', 31157945, 'Jenifer Whitney', 2)
ON CONFLICT (service_line, connecteam_user_id) DO UPDATE SET priority = EXCLUDED.priority, pro_name = EXCLUDED.pro_name;
COMMENT ON TABLE public.jobber_service_pros IS 'DEPRECATED: replaced by jobber_service_pro_pool (several Pros per service)';

CREATE OR REPLACE FUNCTION public.subscription_jobber_owned(_sub uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.id = _sub
    AND s.jobber_job_ids IS NOT NULL AND s.jobber_job_ids NOT IN ('{}'::jsonb, '[]'::jsonb, 'null'::jsonb));
$$;

DROP POLICY IF EXISTS "visits select own" ON public.visits;
CREATE POLICY "visits select own" ON public.visits FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND (subscription_id IS NULL OR jobber_visit_id IS NOT NULL OR NOT public.subscription_jobber_owned(subscription_id)));

CREATE OR REPLACE FUNCTION public.retire_site_visits_for_jobber(_sub uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.visits SET status = 'canceled', lifecycle_reason = 'day_changed', outcome_reason = 'superseded_by_jobber'
   WHERE subscription_id = _sub AND jobber_visit_id IS NULL AND status::text = 'scheduled'
     AND visit_date >= (now() AT TIME ZONE 'America/New_York')::date;
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.retire_site_visits_for_jobber(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.subscriptions_retire_site_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.subscription_jobber_owned(NEW.id) THEN PERFORM public.retire_site_visits_for_jobber(NEW.id); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_subscriptions_retire_site_visits ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_retire_site_visits AFTER INSERT OR UPDATE OF jobber_job_ids ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_retire_site_visits();

ALTER TABLE public.jobber_visits ADD COLUMN IF NOT EXISTS customer_skipped_at timestamptz;

CREATE OR REPLACE FUNCTION public.member_visit_feed(_user uuid DEFAULT NULL)
RETURNS TABLE(id uuid, user_id uuid, subscription_id uuid, service text, visit_date date, time_window text, status text,
  scheduled_start timestamptz, scheduled_end timestamptz, street text, customer_first_name text, size_tier smallint,
  visit_kind text, completed_at timestamptz, jobber_visit_id text, source text, after_photos jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH u AS (SELECT CASE WHEN _user IS NOT NULL AND (auth.uid() IS NULL OR public.current_user_admin()) THEN _user ELSE auth.uid() END AS uid)
  SELECT v.id, v.user_id, v.subscription_id, v.service::text, v.visit_date, v.time_window, v.status::text, v.scheduled_start, v.scheduled_end,
    v.street, v.customer_first_name, v.size_tier, v.visit_kind, v.completed_at, v.jobber_visit_id, 'tidy', NULL::jsonb
  FROM public.visits v, u WHERE v.user_id = u.uid
    AND (v.subscription_id IS NULL OR NOT public.subscription_jobber_owned(v.subscription_id))
  UNION ALL
  SELECT j.id, j.user_id, j.subscription_id, j.service_line, (j.start_at AT TIME ZONE 'America/New_York')::date,
    to_char(j.start_at AT TIME ZONE 'America/New_York','FMHH12:MI AM') || ' – ' || to_char(j.end_at AT TIME ZONE 'America/New_York','FMHH12:MI AM'),
    CASE WHEN j.customer_skipped_at IS NOT NULL THEN 'skipped' WHEN j.status = 'complete' THEN 'complete' WHEN j.deleted_at IS NOT NULL THEN 'canceled' ELSE 'scheduled' END,
    j.start_at, j.end_at, split_part(j.address, ',', 1), j.customer_first_name, j.size_tier, j.visit_kind, j.completed_at, j.jobber_visit_id, 'jobber', j.after_photos
  FROM public.jobber_visits j, u WHERE j.user_id = u.uid AND NOT j.is_test
    AND (j.deleted_at IS NULL OR j.customer_skipped_at IS NOT NULL);
$$;
REVOKE EXECUTE ON FUNCTION public.member_visit_feed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.member_visit_feed(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_jobber_route_households(_from date, _to date)
RETURNS TABLE(connecteam_user_id bigint, pro_name text, visit_date date, homes integer, visits integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT j.connecteam_user_id, coalesce(max(p.pro_name), CASE WHEN j.connecteam_user_id IS NULL THEN 'Open shift' ELSE j.connecteam_user_id::text END),
    (j.start_at AT TIME ZONE 'America/New_York')::date, count(DISTINCT coalesce(j.user_id::text, j.address))::integer, count(*)::integer
  FROM public.jobber_visits j LEFT JOIN public.jobber_service_pro_pool p ON p.connecteam_user_id = j.connecteam_user_id
  WHERE public.current_user_admin() AND j.deleted_at IS NULL AND NOT j.is_test
    AND (j.start_at AT TIME ZONE 'America/New_York')::date BETWEEN _from AND _to
  GROUP BY j.connecteam_user_id, (j.start_at AT TIME ZONE 'America/New_York')::date ORDER BY 3, 2;
$$;

SELECT public.retire_site_visits_for_jobber(s.id) FROM public.subscriptions s WHERE public.subscription_jobber_owned(s.id);