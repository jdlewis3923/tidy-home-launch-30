-- Retire the old cadence-tier rows and the XL Size Upgrade prices (bands
-- replace them; keeping them would double-bill for property size).
DELETE FROM public.stripe_catalog WHERE addon_name IN ('xl_cleaning','xl_lawn','xl_detailing');
DELETE FROM public.stripe_catalog WHERE is_addon = false AND band IS NULL;

-- Service rows are now keyed by band, not cadence.
ALTER TABLE public.stripe_catalog DROP CONSTRAINT IF EXISTS stripe_catalog_shape_check;
ALTER TABLE public.stripe_catalog
  ADD CONSTRAINT stripe_catalog_shape_check CHECK (
    (is_addon = true AND addon_name IS NOT NULL)
    OR (is_addon = false AND service_type IS NOT NULL AND band IS NOT NULL)
  );

INSERT INTO public.stripe_catalog
  (service_type, frequency, band, per_visit, is_addon, addon_name, stripe_product_id, stripe_price_id, price_cents, description, sort_order, active)
VALUES
  ('cleaning', NULL, 'compact',  true, false, NULL, 'prod_V9xQs6lixEmaXs', 'price_1U9dWND7AxvAjJGvikkpM5oo', 11900, 'House Cleaning — Compact (per visit)',  10, true),
  ('cleaning', NULL, 'standard', true, false, NULL, 'prod_V9xQs6lixEmaXs', 'price_1U9dWdD7AxvAjJGv0476nn3e', 14900, 'House Cleaning — Standard (per visit)', 11, true),
  ('cleaning', NULL, 'large',    true, false, NULL, 'prod_V9xQs6lixEmaXs', 'price_1U9dWiD7AxvAjJGvXpIZJ367', 21900, 'House Cleaning — Large (per visit)',    12, true),
  ('cleaning', NULL, 'estate',   true, false, NULL, 'prod_V9xQs6lixEmaXs', 'price_1U9dWmD7AxvAjJGvbSwUpNZu', 29900, 'House Cleaning — Estate (per visit)',   13, true),
  ('lawn', NULL, 'compact',  true, false, NULL, 'prod_V9xQtvYJFErOag', 'price_1U9dWrD7AxvAjJGv0d6VTUcs',  5500, 'Lawn Care — Compact (per visit)',  20, true),
  ('lawn', NULL, 'standard', true, false, NULL, 'prod_V9xQtvYJFErOag', 'price_1U9dWvD7AxvAjJGvaCMrL4Jp',  6900, 'Lawn Care — Standard (per visit)', 21, true),
  ('lawn', NULL, 'large',    true, false, NULL, 'prod_V9xQtvYJFErOag', 'price_1U9dWzD7AxvAjJGv58uQlPNP', 10500, 'Lawn Care — Large (per visit)',    22, true),
  ('lawn', NULL, 'estate',   true, false, NULL, 'prod_V9xQtvYJFErOag', 'price_1U9dXCD7AxvAjJGveTN1h0Rg', 13500, 'Lawn Care — Estate (per visit)',   23, true),
  ('detailing', NULL, 'compact',  true, false, NULL, 'prod_V9xQ8RCRFTdLBK', 'price_1U9dXGD7AxvAjJGv2bx2MHGJ', 11900, 'Car Detailing — Compact (per visit)',  30, true),
  ('detailing', NULL, 'standard', true, false, NULL, 'prod_V9xQ8RCRFTdLBK', 'price_1U9dXKD7AxvAjJGvGVpD41QG', 13900, 'Car Detailing — Standard (per visit)', 31, true),
  ('detailing', NULL, 'large',    true, false, NULL, 'prod_V9xQ8RCRFTdLBK', 'price_1U9dXPD7AxvAjJGvJmXLFvts', 17900, 'Car Detailing — Large (per visit)',    32, true),
  ('detailing', NULL, 'estate',   true, false, NULL, 'prod_V9xQ8RCRFTdLBK', 'price_1U9dXTD7AxvAjJGvx6gFOj2X', 21900, 'Car Detailing — Estate (per visit)',   33, true);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_catalog_service_band_uidx
  ON public.stripe_catalog (service_type, band) WHERE is_addon = false;