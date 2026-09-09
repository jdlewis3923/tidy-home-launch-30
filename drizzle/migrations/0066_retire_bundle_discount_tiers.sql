-- Bundle discounts do not exist. Bundling is one free premium add-on per month
-- (see pricing-canon). Nothing in the application reads bundle_discount_tiers:
-- the old comment claiming stripe-create-checkout reads it was false. Keep the
-- table as dead data (no drops), but stop exposing it to the browser.
REVOKE SELECT ON public.bundle_discount_tiers FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.bundle_discount_tiers FROM authenticated;

COMMENT ON TABLE public.bundle_discount_tiers IS
  'RETIRED / DEAD DATA. Percentage bundle discounts were withdrawn. Nothing reads this table. The live bundle benefit is one free premium add-on per month for 2+ services, defined in src/lib/pricing-canon.ts. Do not reintroduce percentages.';