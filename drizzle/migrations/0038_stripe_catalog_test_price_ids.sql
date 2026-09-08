-- Test-mode price ids live alongside the live ones so a test booking can run
-- end to end without touching a single live price. Additive and nullable.
ALTER TABLE public.stripe_catalog
  ADD COLUMN IF NOT EXISTS stripe_price_id_test TEXT;