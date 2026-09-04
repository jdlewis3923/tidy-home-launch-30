-- Badge verification columns on the Pro record (applicants table)
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS verify_token text,
  ADD COLUMN IF NOT EXISTS pro_number text,
  ADD COLUMN IF NOT EXISTS badge_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS badge_photo_url text,
  ADD COLUMN IF NOT EXISTS pro_since date;

ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_badge_status_check;
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_badge_status_check
  CHECK (badge_status IN ('active','inactive','terminated'));

-- Friendly, display-only Pro number sequence
CREATE SEQUENCE IF NOT EXISTS public.pro_number_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.assign_pro_badge_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verify_token IS NULL OR NEW.verify_token = '' THEN
    -- 32 hex chars of randomness: not enumerable, unlike the Pro number.
    NEW.verify_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  IF NEW.pro_number IS NULL OR NEW.pro_number = '' THEN
    NEW.pro_number := 'TIDY-' || lpad(nextval('public.pro_number_seq')::text, 4, '0');
  END IF;
  IF NEW.pro_since IS NULL THEN
    NEW.pro_since := COALESCE(NEW.created_at::date, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pro_badge_identifiers ON public.applicants;
CREATE TRIGGER trg_assign_pro_badge_identifiers
  BEFORE INSERT ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.assign_pro_badge_identifiers();

-- Backfill existing Pros
UPDATE public.applicants
SET verify_token = encode(gen_random_bytes(16), 'hex')
WHERE verify_token IS NULL OR verify_token = '';

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.applicants WHERE pro_number IS NULL OR pro_number = '' ORDER BY created_at LOOP
    UPDATE public.applicants
    SET pro_number = 'TIDY-' || lpad(nextval('public.pro_number_seq')::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

UPDATE public.applicants SET pro_since = created_at::date WHERE pro_since IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS applicants_verify_token_key ON public.applicants (verify_token);
CREATE UNIQUE INDEX IF NOT EXISTS applicants_pro_number_key ON public.applicants (pro_number);

-- Public, token-scoped badge lookup. Returns ONLY badge-safe fields; never the
-- last name, contact details, ratings, or insurance documents.
CREATE OR REPLACE FUNCTION public.verify_pro_badge(_token text)
RETURNS TABLE (
  display_name text,
  pro_number text,
  badge_status text,
  badge_photo_url text,
  services text,
  bg_check_cleared_at date,
  insurance_active boolean,
  pro_since date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.first_name || ' ' || left(a.last_name, 1) || '.' AS display_name,
    a.pro_number,
    a.badge_status,
    CASE WHEN a.badge_status = 'active' THEN a.badge_photo_url ELSE a.badge_photo_url END,
    a.service,
    a.bg_check_completed_at::date,
    (a.insurance_status = 'active' OR a.coi_review_status = 'approved') AS insurance_active,
    a.pro_since
  FROM public.applicants a
  WHERE a.verify_token = _token
    AND _token IS NOT NULL
    AND length(_token) >= 16
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.verify_pro_badge(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_pro_badge(text) TO anon, authenticated, service_role;