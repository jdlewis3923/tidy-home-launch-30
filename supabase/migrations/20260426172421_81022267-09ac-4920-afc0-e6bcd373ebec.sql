-- Phase 2 — Stripe catalog & schema extensions

-- 1. stripe_catalog: maps Tidy services/add-ons to live Stripe price IDs
CREATE TABLE IF NOT EXISTS public.stripe_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type service_type,
  frequency subscription_frequency,
  is_addon BOOLEAN NOT NULL DEFAULT false,
  addon_name TEXT,
  stripe_product_id TEXT,
  stripe_price_id TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  bundle_discount_pct INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT stripe_catalog_shape_check CHECK (
    (is_addon = false AND service_type IS NOT NULL AND frequency IS NOT NULL AND addon_name IS NULL)
    OR
    (is_addon = true AND addon_name IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_stripe_catalog_lookup
  ON public.stripe_catalog(service_type, frequency, is_addon, active);

CREATE INDEX IF NOT EXISTS idx_stripe_catalog_addon
  ON public.stripe_catalog(addon_name, active) WHERE is_addon = true;

ALTER TABLE public.stripe_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_catalog read active" ON public.stripe_catalog;
CREATE POLICY "stripe_catalog read active"
  ON public.stripe_catalog FOR SELECT
  USING (active = true);

-- service_role bypasses RLS by default; no write policy needed for it.
-- Admins get full read for inspection.
DROP POLICY IF EXISTS "stripe_catalog admin select all" ON public.stripe_catalog;
CREATE POLICY "stripe_catalog admin select all"
  ON public.stripe_catalog FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. subscriptions: add Stripe customer + bundle discount
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS bundle_discount_pct INTEGER NOT NULL DEFAULT 0;

-- Unique constraint on stripe_subscription_id (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_stripe_subscription_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_stripe_subscription_id_key UNIQUE (stripe_subscription_id);
  END IF;
END$$;

-- 3. invoices: add paid_at; ensure stripe_invoice_id is unique
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoices_stripe_invoice_id_key'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_stripe_invoice_id_key UNIQUE (stripe_invoice_id);
  END IF;
END$$;

-- 4. integration_logs: composite index for fast idempotency lookups
CREATE INDEX IF NOT EXISTS idx_integration_logs_idempotency
  ON public.integration_logs(source, event);
