CREATE OR REPLACE FUNCTION public.contractor_visit_pay_cents(_service text, _size smallint, _cadence text, _tier text DEFAULT NULL::text, _surcharge boolean DEFAULT false, _visit_kind text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
        WHEN 1 THEN CASE cad WHEN 'monthly' THEN 1800 WHEN 'biweekly' THEN 1600 ELSE 1500 END
        WHEN 2 THEN CASE cad WHEN 'monthly' THEN 2600 WHEN 'biweekly' THEN 2400 ELSE 2100 END
        WHEN 3 THEN CASE cad WHEN 'monthly' THEN 4000 WHEN 'biweekly' THEN 3600 ELSE 3200 END
      END;
      IF _surcharge THEN base := base + 1200; END IF;
    END IF;
  END IF;

  IF base IS NULL THEN RETURN NULL; END IF;
  IF _tier = 'tier_2_pro_partner' THEN base := round(base * 1.1); END IF;
  RETURN base;
END;
$function$;