CREATE OR REPLACE FUNCTION public.contractor_visit_pay_cents(_service text, _size smallint, _cadence text, _tier text DEFAULT NULL::text, _surcharge boolean DEFAULT false, _visit_kind text DEFAULT NULL::text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE base integer;
BEGIN
  -- Cadence never moves Pro pay: the cadence discount comes out of Tidy's margin.
  IF _service = 'detailing' THEN
    base := CASE _size
      WHEN 1 THEN CASE WHEN _visit_kind = 'full_detail' THEN 5100 ELSE 1700 END
      WHEN 2 THEN CASE WHEN _visit_kind = 'full_detail' THEN 6100 ELSE 2000 END
      WHEN 3 THEN CASE WHEN _visit_kind = 'full_detail' THEN 8200 ELSE 2700 END END;
  ELSIF _service = 'cleaning' THEN
    base := CASE _size WHEN 1 THEN 5600 WHEN 2 THEN 7600 WHEN 3 THEN 11200 END;
    IF base IS NOT NULL AND _surcharge THEN base := base + 2400; END IF;
  ELSIF _service = 'lawn' THEN
    -- The old extra-large lawn surcharge is retired; the size bands replace it.
    base := CASE _size WHEN 1 THEN 1800 WHEN 2 THEN 2600 WHEN 3 THEN 4000 END;
  END IF;
  IF base IS NULL THEN RETURN NULL; END IF;
  IF _tier = 'tier_2_pro_partner' THEN base := (round((base / 100.0) * 1.1) * 100)::int; END IF;
  RETURN base;
END $$;