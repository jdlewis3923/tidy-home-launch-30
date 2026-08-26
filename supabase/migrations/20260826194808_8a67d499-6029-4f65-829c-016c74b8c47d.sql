CREATE TABLE IF NOT EXISTS public.bundle_discount_tiers (
  service_count integer PRIMARY KEY CHECK (service_count >= 2),
  discount_pct integer NOT NULL CHECK (discount_pct >= 0 AND discount_pct <= 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.bundle_discount_tiers IS
  'Single source of truth for the bundle discount actually charged. Displayed price (client) and stripe-create-checkout both read this table.';

GRANT SELECT ON public.bundle_discount_tiers TO anon;
GRANT SELECT ON public.bundle_discount_tiers TO authenticated;
GRANT ALL ON public.bundle_discount_tiers TO service_role;

ALTER TABLE public.bundle_discount_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bundle discount tiers are publicly readable" ON public.bundle_discount_tiers;
CREATE POLICY "Bundle discount tiers are publicly readable"
  ON public.bundle_discount_tiers FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage bundle discount tiers" ON public.bundle_discount_tiers;
CREATE POLICY "Admins manage bundle discount tiers"
  ON public.bundle_discount_tiers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.bundle_discount_tiers (service_count, discount_pct)
VALUES (2, 10), (3, 15)
ON CONFLICT (service_count) DO UPDATE SET discount_pct = EXCLUDED.discount_pct, updated_at = now();

-- Keep the legacy app_settings mirror aligned with the tiers table.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('bundle_discount_pct', '{"2": 10, "3": 15}'::jsonb, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- Every recurring price is inside the bundle coupon's scope, so no catalog row
-- may claim 0% eligibility. The tier that is actually charged depends on how
-- many distinct services the customer buys (see bundle_discount_tiers).
UPDATE public.stripe_catalog
SET bundle_discount_pct = (SELECT MAX(discount_pct) FROM public.bundle_discount_tiers)
WHERE bundle_discount_pct IS DISTINCT FROM (SELECT MAX(discount_pct) FROM public.bundle_discount_tiers);

COMMENT ON COLUMN public.stripe_catalog.bundle_discount_pct IS
  'Maximum bundle discount this price is eligible for. The rate actually charged is chosen by distinct-service count in public.bundle_discount_tiers.';