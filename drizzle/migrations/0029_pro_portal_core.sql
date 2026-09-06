-- Tidy Pro Portal — schema, pay rates, RLS and server-side rules.
-- Pro identity = public.applicants row whose contractor_id is the auth user id.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pro';

-- 1 · visits: Pro assignment + Pro-visible operational fields -----------------
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS assigned_pro_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_start timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_end timestamptz,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS customer_first_name text,
  ADD COLUMN IF NOT EXISTS access_notes text,
  ADD COLUMN IF NOT EXISTS gate_code text,
  ADD COLUMN IF NOT EXISTS pet_notes text,
  ADD COLUMN IF NOT EXISTS parking_notes text,
  ADD COLUMN IF NOT EXISTS visit_pay_cents integer,
  ADD COLUMN IF NOT EXISTS on_my_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_sample boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS visits_assigned_pro_idx ON public.visits (assigned_pro_id, scheduled_start);

DROP POLICY IF EXISTS "visits assigned pro select" ON public.visits;
CREATE POLICY "visits assigned pro select" ON public.visits
  FOR SELECT TO authenticated USING (assigned_pro_id = auth.uid());

-- 2 · flat per-visit pay ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pro_visit_pay_cents(
  _service_type text, _frequency text, _tier text DEFAULT 'tier_1_verified'
) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN base IS NULL THEN NULL
    WHEN _tier = 'tier_2_pro_partner' THEN round(base * 1.10)::int
    ELSE base
  END
  FROM (
    SELECT CASE lower(coalesce(_service_type,''))
      WHEN 'cleaning' THEN CASE lower(coalesce(_frequency,'monthly'))
        WHEN 'weekly' THEN 4600 WHEN 'biweekly' THEN 5500 ELSE 6400 END
      WHEN 'lawn' THEN CASE lower(coalesce(_frequency,'monthly'))
        WHEN 'weekly' THEN 2500 WHEN 'biweekly' THEN 2600 ELSE 3400 END
      WHEN 'detailing' THEN CASE lower(coalesce(_frequency,'monthly'))
        WHEN 'weekly' THEN NULL WHEN 'biweekly' THEN 5000 ELSE 6400 END
      ELSE NULL END AS base
  ) t;
$$;

-- 3 · visit photos -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.visit_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  pro_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('before','after')),
  storage_path text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.visit_photos TO authenticated;
GRANT ALL ON public.visit_photos TO service_role;
ALTER TABLE public.visit_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_photos own select" ON public.visit_photos
  FOR SELECT TO authenticated USING (pro_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "visit_photos own insert" ON public.visit_photos
  FOR INSERT TO authenticated WITH CHECK (
    pro_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.assigned_pro_id = auth.uid())
  );
CREATE POLICY "visit_photos own delete" ON public.visit_photos
  FOR DELETE TO authenticated USING (pro_id = auth.uid());

-- 4 · checklists -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  section text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
GRANT SELECT ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_templates read" ON public.checklist_templates
  FOR SELECT TO authenticated USING (active);
CREATE POLICY "checklist_templates admin" ON public.checklist_templates
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.visit_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  pro_id uuid NOT NULL,
  checked_at timestamptz,
  UNIQUE (visit_id, template_id)
);
GRANT SELECT, INSERT, UPDATE ON public.visit_checklist_items TO authenticated;
GRANT ALL ON public.visit_checklist_items TO service_role;
ALTER TABLE public.visit_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_checklist own select" ON public.visit_checklist_items
  FOR SELECT TO authenticated USING (pro_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "visit_checklist own insert" ON public.visit_checklist_items
  FOR INSERT TO authenticated WITH CHECK (
    pro_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.visits v WHERE v.id = visit_id AND v.assigned_pro_id = auth.uid())
  );
CREATE POLICY "visit_checklist own update" ON public.visit_checklist_items
  FOR UPDATE TO authenticated USING (pro_id = auth.uid()) WITH CHECK (pro_id = auth.uid());

-- 5 · payout weeks -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  payout_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  visit_pay_cents integer NOT NULL DEFAULT 0,
  bonus_cents integer NOT NULL DEFAULT 0,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pro_id, week_start)
);
GRANT SELECT ON public.payout_weeks TO authenticated;
GRANT ALL ON public.payout_weeks TO service_role;
ALTER TABLE public.payout_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payout_weeks own select" ON public.payout_weeks
  FOR SELECT TO authenticated USING (pro_id = auth.uid() OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "payout_weeks admin all" ON public.payout_weeks
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- 6 · bonuses: typed, dated, capped -----------------------------------------
ALTER TABLE public.pro_bonuses
  ADD COLUMN IF NOT EXISTS bonus_type text,
  ADD COLUMN IF NOT EXISTS related_visit_id uuid,
  ADD COLUMN IF NOT EXISTS month_key text,
  ADD COLUMN IF NOT EXISTS earned_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.enforce_review_bonus_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  IF coalesce(NEW.bonus_type,'') <> 'verified_review' THEN RETURN NEW; END IF;
  IF NEW.month_key IS NULL THEN
    NEW.month_key := to_char(coalesce(NEW.earned_at, now()), 'YYYY-MM');
  END IF;
  SELECT count(*) INTO v_count FROM public.pro_bonuses
  WHERE pro_id = NEW.pro_id AND bonus_type = 'verified_review' AND month_key = NEW.month_key
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF v_count >= 4 THEN
    RAISE EXCEPTION 'verified review bonus cap reached for % (max 4 per calendar month)', NEW.month_key;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_review_bonus_cap ON public.pro_bonuses;
CREATE TRIGGER trg_review_bonus_cap BEFORE INSERT OR UPDATE ON public.pro_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_bonus_cap();

-- 7 · COI readiness gate (reads existing contractor_insurance) ---------------
CREATE OR REPLACE FUNCTION public.pro_coi_state(_pro uuid)
RETURNS TABLE(status text, carrier text, policy_number text, expires_at date, certificate_path text, can_work boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;

-- 8 · Pro-safe visit feed: ONLY the whitelisted columns ----------------------
CREATE OR REPLACE FUNCTION public.pro_get_visits(_from date DEFAULT (CURRENT_DATE - 60), _to date DEFAULT (CURRENT_DATE + 60))
RETURNS TABLE(
  id uuid, scheduled_start timestamptz, scheduled_end timestamptz, service_type text,
  street text, zip text, customer_first_name text, access_notes text, gate_code text,
  pet_notes text, parking_notes text, visit_pay_cents integer, status text,
  on_my_way_at timestamptz, completed_at timestamptz, is_sample boolean,
  before_photos integer, after_photos integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.scheduled_start, v.scheduled_end, v.service_type, v.street, v.zip,
         v.customer_first_name, v.access_notes, v.gate_code, v.pet_notes, v.parking_notes,
         v.visit_pay_cents, v.status::text, v.on_my_way_at, v.completed_at, v.is_sample,
         (SELECT count(*)::int FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind='before'),
         (SELECT count(*)::int FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind='after')
  FROM public.visits v
  WHERE v.assigned_pro_id = auth.uid()
    AND (v.scheduled_start IS NULL OR v.scheduled_start::date BETWEEN _from AND _to)
  ORDER BY v.scheduled_start NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.pro_get_me()
RETURNS TABLE(
  pro_id uuid, first_name text, tier text, completed_visits integer, avg_rating numeric,
  active_since timestamptz, badge_status text, badge_token text, referral_code text, pro_number text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.first_name, a.tier, a.completed_visits, a.avg_customer_rating,
         coalesce(a.pro_since::timestamptz, a.created_at), a.badge_status, a.verify_token,
         (SELECT p.referral_code FROM public.profiles p WHERE p.user_id = a.contractor_id),
         a.pro_number
  FROM public.applicants a
  WHERE a.contractor_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.pro_get_visits(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.pro_get_me() FROM anon;
REVOKE ALL ON FUNCTION public.pro_coi_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pro_get_visits(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_get_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_coi_state(uuid) TO authenticated;
