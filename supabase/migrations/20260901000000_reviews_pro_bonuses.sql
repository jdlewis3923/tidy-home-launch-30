-- Review-to-Pro-bonus data layer: reviews ingestion, attribution, bonus payout.

-- 1. reviews
CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'manual',
  external_review_id text,
  dedupe_hash text,
  reviewer_name text NOT NULL,
  stars integer NOT NULL,
  comment text,
  posted_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  matched_job_id uuid,
  matched_pro_id uuid,
  match_confidence text NOT NULL DEFAULT 'none',
  match_score integer,
  match_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  fraud_flag boolean NOT NULL DEFAULT false,
  fraud_reason text,
  status text NOT NULL DEFAULT 'new',
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  rejected_reason text,
  post_paid_edit_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reviews_stars_chk CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT reviews_confidence_chk CHECK (match_confidence IN ('high','medium','low','none')),
  CONSTRAINT reviews_status_chk CHECK (status IN ('new','matched','approved','paid','rejected','expired'))
);

CREATE UNIQUE INDEX reviews_external_review_id_uidx ON public.reviews(external_review_id) WHERE external_review_id IS NOT NULL;
CREATE UNIQUE INDEX reviews_dedupe_hash_uidx ON public.reviews(dedupe_hash) WHERE dedupe_hash IS NOT NULL;
CREATE INDEX reviews_matched_pro_idx ON public.reviews(matched_pro_id);
CREATE INDEX reviews_status_idx ON public.reviews(status);
CREATE INDEX reviews_posted_at_idx ON public.reviews(posted_at);

CREATE TRIGGER reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

CREATE POLICY "Admins manage reviews"
  ON public.reviews FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Pros read own matched reviews"
  ON public.reviews FOR SELECT TO authenticated
  USING (matched_pro_id = auth.uid());

-- 2. pro_bonuses
CREATE TABLE public.pro_bonuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  reason text NOT NULL DEFAULT 'review_bonus',
  review_id uuid REFERENCES public.reviews(id) ON DELETE SET NULL,
  period text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  blocked_reason text,
  stripe_transfer_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  CONSTRAINT pro_bonuses_status_chk CHECK (status IN ('pending','paid')),
  CONSTRAINT pro_bonuses_period_chk CHECK (period ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX pro_bonuses_idem_uidx ON public.pro_bonuses(pro_id, period, review_id);
CREATE INDEX pro_bonuses_pro_period_idx ON public.pro_bonuses(pro_id, period);
CREATE INDEX pro_bonuses_status_idx ON public.pro_bonuses(status);

ALTER TABLE public.pro_bonuses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.pro_bonuses TO authenticated;
GRANT ALL ON public.pro_bonuses TO service_role;

CREATE POLICY "Admins manage pro_bonuses"
  ON public.pro_bonuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Pros read own bonuses"
  ON public.pro_bonuses FOR SELECT TO authenticated
  USING (pro_id = auth.uid());

-- 3. Policy constants (admin-editable via app_settings)
INSERT INTO public.app_settings (key, value, updated_at) VALUES
  ('review_bonus_amount_cents', '2500'::jsonb, now()),
  ('review_bonus_cap_per_month', '4'::jsonb, now()),
  ('review_bonus_hold_days', '7'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

-- 4. Weekly attribution + digest + expiry cron — Mondays 8:00 AM ET (~12:00 UTC winter / 13:00 UTC summer; scheduled at 12:00 UTC, function is idempotent/bounded so drift is harmless).
SELECT cron.schedule(
  'reviews-weekly-digest',
  '0 12 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/reviews-weekly-digest',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);
