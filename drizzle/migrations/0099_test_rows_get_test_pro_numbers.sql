CREATE OR REPLACE FUNCTION public.assign_pro_badge_identifiers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.verify_token IS NULL OR NEW.verify_token = '' THEN
    NEW.verify_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  IF (NEW.pro_number IS NULL OR NEW.pro_number = '')
     AND NEW.current_stage IN ('contract_signed','oriented','active') THEN
    IF coalesce(NEW.is_test_row, false) THEN
      -- Test records get a TEST- number and never touch the real sequence.
      NEW.pro_number := 'TEST-' || upper(substr(replace(NEW.id::text,'-',''),1,4));
    ELSE
      NEW.pro_number := coalesce(NULLIF(NEW.pro_number_reserved,''),
        'TIDY-' || lpad(pg_catalog.nextval('public.pro_number_seq_v2'::regclass)::text, 4, '0'));
    END IF;
    IF NEW.pro_since IS NULL THEN NEW.pro_since := CURRENT_DATE; END IF;
  END IF;
  RETURN NEW;
END;
$function$;