-- 1. Car access gate answers on the order record.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS has_water_spigot boolean,
  ADD COLUMN IF NOT EXISTS has_electrical_outlet boolean,
  ADD COLUMN IF NOT EXISTS washing_allowed boolean,
  ADD COLUMN IF NOT EXISTS car_service_code text;

-- 2. Reviews ingested from Google (adapter A = manual paste/CSV).
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'google_manual',
  external_review_id text NOT NULL UNIQUE,
  reviewer_name text,
  stars integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment text,
  posted_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  matched_job_id text,
  matched_pro_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  match_confidence text NOT NULL DEFAULT 'none'
    CHECK (match_confidence IN ('high','medium','low','none')),
  match_score numeric,
  match_debug jsonb,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','matched','awaiting_approval','approved','paid','rejected','expired')),
  fraud_flag text,
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviews_status_idx ON public.reviews (status);
CREATE INDEX IF NOT EXISTS reviews_posted_at_idx ON public.reviews (posted_at DESC);
CREATE INDEX IF NOT EXISTS reviews_matched_pro_idx ON public.reviews (matched_pro_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_admin_all ON public.reviews;
CREATE POLICY reviews_admin_all ON public.reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. Pro bonuses (paid out via Stripe Connect as their own transfer).
CREATE TABLE IF NOT EXISTS public.pro_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  reason text NOT NULL DEFAULT 'review_bonus',
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','blocked')),
  stripe_transfer_id text,
  blocked_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS pro_bonuses_review_unique
  ON public.pro_bonuses (review_id) WHERE review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pro_bonuses_pro_period_idx ON public.pro_bonuses (pro_id, period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_bonuses TO authenticated;
GRANT ALL ON public.pro_bonuses TO service_role;
ALTER TABLE public.pro_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pro_bonuses_admin_all ON public.pro_bonuses;
CREATE POLICY pro_bonuses_admin_all ON public.pro_bonuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS pro_bonuses_own_select ON public.pro_bonuses;
CREATE POLICY pro_bonuses_own_select ON public.pro_bonuses FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applicants a
    WHERE a.id = pro_bonuses.pro_id AND a.contractor_id = auth.uid()
  ));

-- 4. Admin-editable policy constants.
INSERT INTO public.app_settings (key, value)
VALUES ('review_bonus', jsonb_build_object(
  'amount_cents', 2500,
  'cap_per_month', 4,
  'hold_days', 7,
  'excluded_reviewer_names', jsonb_build_array('A Google User')
))
ON CONFLICT (key) DO NOTHING;