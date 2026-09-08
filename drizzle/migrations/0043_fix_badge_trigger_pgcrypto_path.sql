-- BEFORE INSERT trigger on applicants failed with "function gen_random_bytes(integer) does not exist"
-- because pgcrypto lives in the extensions schema and the function pins search_path to public.
-- Schema-qualify the call; behaviour unchanged.
CREATE OR REPLACE FUNCTION public.assign_pro_badge_identifiers()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.verify_token IS NULL OR NEW.verify_token = '' THEN
    -- 32 hex chars of randomness: not enumerable, unlike the Pro number.
    NEW.verify_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  IF NEW.pro_number IS NULL OR NEW.pro_number = '' THEN
    NEW.pro_number := 'TIDY-' || lpad(nextval('public.pro_number_seq')::text, 4, '0');
  END IF;
  IF NEW.pro_since IS NULL THEN
    NEW.pro_since := COALESCE(NEW.created_at::date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$function$;