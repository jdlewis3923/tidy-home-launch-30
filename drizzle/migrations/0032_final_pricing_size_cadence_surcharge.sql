-- FINAL PRICING STRUCTURE: size sets the per-visit price, cadence applies the
-- volume curve, the customer is always billed monthly.
--
-- Every subscription stores service, size_tier, cadence and surcharge_applied.
-- Every visit copies all four plus the contractor pay resolved at creation time,
-- so a later price change never silently reprices completed work.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS size_tier smallint,
  ADD COLUMN IF NOT EXISTS cadence text,
  ADD COLUMN IF NOT EXISTS surcharge_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS surcharge_cents integer NOT NULL DEFAULT 0,
  -- one row per service line: {service, size_tier, cadence, surcharge_applied,
  -- surcharge_cents, monthly_cents, lookup_key, stripe_price_id}
  ADD COLUMN IF NOT EXISTS plan_lines jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS size_tier smallint,
  ADD COLUMN IF NOT EXISTS cadence text,
  ADD COLUMN IF NOT EXISTS surcharge_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contractor_pay_cents integer,
  -- 'maintenance_wash' | 'full_detail' | 'quarterly_deep_clean' | NULL
  ADD COLUMN IF NOT EXISTS visit_kind text,
  -- a visit free to the customer, or blocked through no fault of the pro, is PAID IN FULL
  ADD COLUMN IF NOT EXISTS paid_in_full_reason text;

-- Backfill the cadence already carried by subscriptions.frequency.
UPDATE public.subscriptions SET cadence = frequency::text WHERE cadence IS NULL;
UPDATE public.subscriptions SET size_tier = size WHERE size_tier IS NULL AND size IS NOT NULL;

-- Contractor pay: 40% of the visit price, by service, size and cadence. Explicit
-- dollars so no rounding rule can drift from src/lib/pricing-canon.ts.
CREATE OR REPLACE FUNCTION public.contractor_visit_pay_cents(
  _service text,
  _size smallint,
  _cadence text,
  _tier text DEFAULT NULL,
  _surcharge boolean DEFAULT false,
  _visit_kind text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  base integer;
  cad text := COALESCE(_cadence, 'monthly');
BEGIN
  IF _service = 'detailing' THEN
    base := CASE _size
      WHEN 1 THEN CASE WHEN _visit_kind = 'full_detail' THEN 5100 ELSE 1700 END
      WHEN 2 THEN CASE WHEN _visit_kind = 'full_detail' THEN 6100 ELSE 2000 END
      WHEN 3 THEN CASE WHEN _visit_kind = 'full_detail' THEN 8200 ELSE 2700 END
    END;
  ELSE
    -- A weekly cleaning plan's quarterly deep clean is paid as an extra visit
    -- at the MONTHLY rate for that size.
    IF _service = 'cleaning' AND _visit_kind = 'quarterly_deep_clean' THEN
      cad := 'monthly';
    END IF;

    IF _service = 'cleaning' THEN
      base := CASE _size
        WHEN 1 THEN CASE cad WHEN 'monthly' THEN 5600 WHEN 'biweekly' THEN 5100 ELSE 4600 END
        WHEN 2 THEN CASE cad WHEN 'monthly' THEN 7600 WHEN 'biweekly' THEN 7000 ELSE 6200 END
        WHEN 3 THEN CASE cad WHEN 'monthly' THEN 11200 WHEN 'biweekly' THEN 10300 ELSE 9200 END
      END;
      IF _surcharge THEN base := base + 2400; END IF;
    ELSIF _service = 'lawn' THEN
      base := CASE _size
        WHEN 1 THEN CASE cad WHEN 'monthly' THEN 2200 WHEN 'biweekly' THEN 2000 ELSE 1800 END
        WHEN 2 THEN CASE cad WHEN 'monthly' THEN 3000 WHEN 'biweekly' THEN 2800 ELSE 2500 END
        WHEN 3 THEN CASE cad WHEN 'monthly' THEN 4400 WHEN 'biweekly' THEN 4000 ELSE 3600 END
      END;
      IF _surcharge THEN base := base + 1200; END IF;
    END IF;
  END IF;

  IF base IS NULL THEN RETURN NULL; END IF;
  IF _tier = 'tier_2_pro_partner' THEN base := round(base * 1.1); END IF;
  RETURN base;
END;
$$;

GRANT EXECUTE ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) TO authenticated, service_role;