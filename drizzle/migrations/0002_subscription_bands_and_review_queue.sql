ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS band TEXT,
  ADD COLUMN IF NOT EXISTS band_source TEXT,
  ADD COLUMN IF NOT EXISTS band_verified_at TIMESTAMPTZ;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_band_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_band_check
  CHECK (band IS NULL OR band IN ('compact','standard','large','estate'));

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_band_source_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_band_source_check
  CHECK (band_source IS NULL OR band_source IN ('self','county','contractor'));

CREATE TABLE IF NOT EXISTS public.band_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id UUID,
  service_type public.service_type NOT NULL,
  self_band TEXT NOT NULL CHECK (self_band IN ('compact','standard','large','estate')),
  county_band TEXT CHECK (county_band IS NULL OR county_band IN ('compact','standard','large','estate')),
  county_sq_ft INTEGER,
  county_source TEXT,
  address TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','corrected','dismissed')),
  resolution_note TEXT,
  resolved_band TEXT CHECK (resolved_band IS NULL OR resolved_band IN ('compact','standard','large','estate')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.band_reviews TO authenticated;
GRANT ALL ON public.band_reviews TO service_role;

ALTER TABLE public.band_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "band_reviews_admin_all" ON public.band_reviews;
CREATE POLICY "band_reviews_admin_all" ON public.band_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS band_reviews_status_idx ON public.band_reviews (status, created_at DESC);