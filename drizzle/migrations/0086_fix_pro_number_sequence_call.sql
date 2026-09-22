-- The guarded public.nextval(text) wrapper shadows pg_catalog.nextval for text
-- arguments, so this trigger was failing every applicant insert with
-- "sequence not allowed: public.pro_number_seq". Call the catalog function
-- directly with a regclass argument, which the wrapper does not shadow.
CREATE OR REPLACE FUNCTION public.assign_pro_badge_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verify_token IS NULL OR NEW.verify_token = '' THEN
    NEW.verify_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  IF NEW.pro_number IS NULL OR NEW.pro_number = '' THEN
    NEW.pro_number := 'TIDY-' || lpad(pg_catalog.nextval('public.pro_number_seq'::regclass)::text, 4, '0');
  END IF;
  IF NEW.pro_since IS NULL THEN
    NEW.pro_since := COALESCE(NEW.created_at::date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$function$;

-- Keep the text wrapper tolerant of a schema-qualified name for any other caller.
CREATE OR REPLACE FUNCTION public.nextval(seq_name text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bare text := regexp_replace(seq_name, '^public\.', '');
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF v_bare NOT IN ('pro_number_seq') THEN
    RAISE EXCEPTION 'sequence not allowed: %', seq_name;
  END IF;
  RETURN pg_catalog.nextval(('public.' || v_bare)::regclass);
END;
$function$;