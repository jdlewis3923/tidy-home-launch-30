INSERT INTO public.bundle_discount_tiers (service_count, discount_pct)
VALUES (2, 10), (3, 15)
ON CONFLICT (service_count) DO UPDATE
SET discount_pct = EXCLUDED.discount_pct,
    updated_at = now();

DELETE FROM public.bundle_discount_tiers
WHERE service_count NOT IN (2, 3);

UPDATE public.stripe_catalog
SET bundle_discount_pct = 0
WHERE bundle_discount_pct IS DISTINCT FROM 0;

COMMENT ON COLUMN public.stripe_catalog.bundle_discount_pct IS
  'Deprecated; always 0. Cart-level bundle rates come only from public.bundle_discount_tiers keyed by distinct service count.';