-- 1) Collision-safe 8-char referral codes, unambiguous alphabet (no O/0/I/1).
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
  attempts int := 0;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..8 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = candidate) THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 25 THEN
      RAISE EXCEPTION 'could not generate unique referral_code';
    END IF;
  END LOOP;
END;
$function$;

-- 2) Trigger: every profile row gets a code at creation.
CREATE OR REPLACE FUNCTION public.set_profile_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.referral_code IS NULL OR btrim(NEW.referral_code) = '' THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_profile_referral_code ON public.profiles;
CREATE TRIGGER trg_set_profile_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_referral_code();

-- 3) Backfill legacy rows with a NULL/blank code.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM public.profiles WHERE referral_code IS NULL OR btrim(referral_code) = '' LOOP
    UPDATE public.profiles
       SET referral_code = public.generate_referral_code()
     WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- 4) Uniqueness guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- 5) Self-healing RPC used by /refer: returns the caller's code, creating it if absent.
CREATE OR REPLACE FUNCTION public.ensure_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  attempts int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT referral_code INTO v_code FROM public.profiles WHERE user_id = v_uid;
  IF v_code IS NOT NULL AND btrim(v_code) <> '' THEN
    RETURN v_code;
  END IF;

  LOOP
    BEGIN
      v_code := public.generate_referral_code();
      INSERT INTO public.profiles (user_id, referral_code)
      VALUES (v_uid, v_code)
      ON CONFLICT (user_id) DO UPDATE SET referral_code = EXCLUDED.referral_code
      WHERE public.profiles.referral_code IS NULL OR btrim(public.profiles.referral_code) = '';

      SELECT referral_code INTO v_code FROM public.profiles WHERE user_id = v_uid;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      attempts := attempts + 1;
      IF attempts > 10 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END$function$;

GRANT EXECUTE ON FUNCTION public.ensure_referral_code() TO authenticated;

-- 6) Distribution route ID carried through door-hanger attribution.
ALTER TABLE public.landing_touches ADD COLUMN IF NOT EXISTS route text;
ALTER TABLE public.qr_scans ADD COLUMN IF NOT EXISTS route text;
