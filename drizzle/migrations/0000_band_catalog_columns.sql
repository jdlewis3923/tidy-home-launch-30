ALTER TABLE public.stripe_catalog
  ADD COLUMN IF NOT EXISTS band TEXT,
  ADD COLUMN IF NOT EXISTS per_visit BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.stripe_catalog
  DROP CONSTRAINT IF EXISTS stripe_catalog_band_check;

ALTER TABLE public.stripe_catalog
  ADD CONSTRAINT stripe_catalog_band_check
  CHECK (band IS NULL OR band IN ('compact','standard','large','estate'));

ALTER TABLE public.stripe_catalog ALTER COLUMN bundle_discount_pct SET DEFAULT 0;
UPDATE public.stripe_catalog SET bundle_discount_pct = 0 WHERE bundle_discount_pct <> 0;
COMMENT ON COLUMN public.stripe_catalog.bundle_discount_pct IS
  'DEPRECATED and always 0. The bundle discount is computed per order server-side from the count of distinct services in the cart. Never read this column.';