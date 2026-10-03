-- 48-hour guarantee: redo requests -------------------------------------------
CREATE TABLE public.redo_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  user_id uuid,
  pro_id uuid,
  applicant_id uuid,
  note text,
  source text NOT NULL DEFAULT 'dashboard',
  status text NOT NULL DEFAULT 'open',
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  redo_visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  scheduled_at timestamptz,
  resolved_at timestamptz,
  admin_notes text,
  is_test_row boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT redo_requests_status_chk CHECK (status IN ('open','scheduled','completed','canceled')),
  CONSTRAINT redo_requests_source_chk CHECK (source IN ('dashboard','email','sms','admin'))
);
CREATE UNIQUE INDEX redo_requests_one_per_visit ON public.redo_requests(visit_id) WHERE status <> 'canceled';
CREATE INDEX redo_requests_pro_idx ON public.redo_requests(pro_id, requested_at);
GRANT SELECT ON public.redo_requests TO authenticated;
GRANT ALL ON public.redo_requests TO service_role;
ALTER TABLE public.redo_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "redo admin all" ON public.redo_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "redo member read own" ON public.redo_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT INSERT, UPDATE, DELETE ON public.redo_requests TO authenticated;

ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS is_redo boolean NOT NULL DEFAULT false;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS redo_of_visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS redo_request_id uuid;
COMMENT ON COLUMN public.visits.is_redo IS '48-hour guarantee return visit: free to the member, Pro paid 50% of the original visit rate, never counts toward Pro Partner or member ask counts.';

-- Praise forwarded to the Pro --------------------------------------------------
CREATE TABLE public.pro_praise (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id uuid UNIQUE,
  visit_id uuid,
  contractor_id uuid,
  applicant_id uuid,
  member_first_name text,
  stars integer,
  quote text,
  message text NOT NULL,
  sms_status text NOT NULL DEFAULT 'queued',
  is_test_row boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pro_praise_applicant_idx ON public.pro_praise(applicant_id, created_at DESC);
GRANT SELECT ON public.pro_praise TO authenticated;
GRANT ALL ON public.pro_praise TO service_role;
ALTER TABLE public.pro_praise ENABLE ROW LEVEL SECURITY;
CREATE POLICY "praise admin read" ON public.pro_praise FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "praise pro read own" ON public.pro_praise FOR SELECT TO authenticated USING (contractor_id = auth.uid());

-- Review / referral asks (one row per ask; never both in one week) -------------
CREATE TABLE public.member_asks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  seq integer NOT NULL DEFAULT 1,
  visit_id uuid,
  release_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  acted_at timestamptz,
  is_test_row boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_asks_kind_chk CHECK (kind IN ('review','referral')),
  CONSTRAINT member_asks_status_chk CHECK (status IN ('queued','sent','skipped')),
  UNIQUE (user_id, kind, seq)
);
GRANT SELECT ON public.member_asks TO authenticated;
GRANT ALL ON public.member_asks TO service_role;
ALTER TABLE public.member_asks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asks admin read" ON public.member_asks FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Pro Partner: 50 visits · 4.8 average · 60 days active ------------------------
CREATE OR REPLACE FUNCTION public.pro_partner_status(_applicant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT id, contractor_id, tier, coalesce(completed_visits,0) AS visits, avg_customer_rating AS rating, pro_since
    FROM public.applicants WHERE id = _applicant
  ), first_visit AS (
    SELECT min(v.completed_at) AS at FROM public.visits v, a
    WHERE v.assigned_pro_id = a.contractor_id AND v.completed_at IS NOT NULL AND NOT v.is_redo
  ), redos AS (
    SELECT count(*) AS n FROM public.redo_requests r, a
    WHERE r.applicant_id = a.id AND r.status <> 'canceled' AND r.requested_at > now() - interval '60 days'
  )
  SELECT jsonb_build_object(
    'tier', a.tier,
    'visits', a.visits,
    'visits_needed', 50,
    'visits_met', a.visits >= 50,
    'rating', a.rating,
    'rating_met', coalesce(a.rating,0) >= 4.8,
    'days_active', coalesce(floor(extract(epoch FROM now() - coalesce(a.pro_since::timestamptz, first_visit.at)) / 86400)::int, 0),
    'days_met', coalesce(now() - coalesce(a.pro_since::timestamptz, first_visit.at) >= interval '60 days', false),
    'redos_60d', redos.n,
    'redo_hold', redos.n > 2,
    'all_met', a.visits >= 50 AND coalesce(a.rating,0) >= 4.8
      AND coalesce(now() - coalesce(a.pro_since::timestamptz, first_visit.at) >= interval '60 days', false)
      AND redos.n <= 2
  ) FROM a, first_visit, redos;
$$;
REVOKE ALL ON FUNCTION public.pro_partner_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_partner_status(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.pro_partner_progress()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.pro_partner_status(id) FROM public.applicants WHERE contractor_id = auth.uid() LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.pro_partner_progress() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_partner_progress() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_pro_partner_status(_applicant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.pro_partner_status(_applicant);
END $$;
REVOKE ALL ON FUNCTION public.admin_pro_partner_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pro_partner_status(uuid) TO authenticated;

/** Promote automatically when all three conditions are met. No approval. */
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
  -- Upcoming, not-yet-completed visits pick up the +10% now; completed visits keep their pay.
  UPDATE public.visits SET contractor_pay_cents = contractor_pay_cents
   WHERE assigned_pro_id = a.contractor_id AND completed_at IS NULL AND contractor_pay_cents IS NOT NULL;
  INSERT INTO public.onboarding_events(applicant_id, event, metadata) VALUES (_applicant, 'tier_2_promoted', jsonb_build_object('rule', '50 visits · 4.8 · 60 days', 'status', s));
  IF a.contractor_id IS NOT NULL THEN
    INSERT INTO public.pro_notifications(contractor_id, kind, title, body, url)
    VALUES (a.contractor_id, 'pro_partner', 'You''re a Pro Partner', 'Your 10% raise is live. It applies from your next visit.', '/pro/schedule');
  END IF;
  INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, metadata)
  VALUES ('pro_partner_promoted', _applicant, coalesce(a.first_name,'') || ' ' || coalesce(left(a.last_name,1),'') || '. is now a Pro Partner', '10% raise applied automatically from the next visit', s);
  RETURN jsonb_build_object('promoted', true, 'status', s);
END $$;
REVOKE ALL ON FUNCTION public.pro_partner_try_promote(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_partner_try_promote(uuid) TO service_role;