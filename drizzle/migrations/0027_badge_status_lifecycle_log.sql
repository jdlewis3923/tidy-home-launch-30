-- Migrate badge_status to a four-state lifecycle and add an append-only audit log.

-- 1. Widen the constraint to the new four states.
ALTER TABLE public.applicants
  DROP CONSTRAINT IF EXISTS applicants_badge_status_check;
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_badge_status_check
  CHECK (badge_status IN ('active','suspended','revoked','not_issued'));

-- 2. Map legacy statuses to the new set.
UPDATE public.applicants
  SET badge_status = CASE
    WHEN badge_status = 'inactive' THEN 'suspended'
    WHEN badge_status = 'terminated' THEN 'revoked'
    WHEN badge_status IS NULL OR badge_status = '' THEN 'not_issued'
    ELSE badge_status
  END
  WHERE badge_status NOT IN ('active','suspended','revoked','not_issued');

-- 3. Append-only badge status log.
CREATE TABLE IF NOT EXISTS public.badge_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE INDEX IF NOT EXISTS idx_badge_status_log_applicant_id ON public.badge_status_log(applicant_id);
CREATE INDEX IF NOT EXISTS idx_badge_status_log_changed_at ON public.badge_status_log(changed_at DESC);

-- 4. Security definer helper: change badge status and log in one call.
CREATE OR REPLACE FUNCTION public.change_badge_status(
  _applicant_id uuid,
  _new_status text,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old_status text;
BEGIN
  IF _new_status NOT IN ('active','suspended','revoked','not_issued') THEN
    RAISE EXCEPTION 'Invalid badge status: %', _new_status;
  END IF;

  SELECT badge_status INTO _old_status
  FROM public.applicants
  WHERE id = _applicant_id;

  IF _old_status IS NULL THEN
    RAISE EXCEPTION 'Applicant not found: %', _applicant_id;
  END IF;

  UPDATE public.applicants
    SET badge_status = _new_status
    WHERE id = _applicant_id;

  INSERT INTO public.badge_status_log (applicant_id, old_status, new_status, changed_by, note)
  VALUES (_applicant_id, _old_status, _new_status, auth.uid(), _note);
END;
$$;

-- 5. Update the public verify function to return the new statuses.
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
    a.badge_photo_url,
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

-- 6. Grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.badge_status_log TO authenticated;
GRANT ALL ON public.badge_status_log TO service_role;
ALTER TABLE public.badge_status_log ENABLE ROW LEVEL SECURITY;

-- Drop then create policies to avoid duplicate-name errors on re-run.
DROP POLICY IF EXISTS "Authenticated admins can read badge status log" ON public.badge_status_log;
CREATE POLICY "Authenticated admins can read badge status log"
  ON public.badge_status_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated admins can insert badge status log" ON public.badge_status_log;
CREATE POLICY "Authenticated admins can insert badge status log"
  ON public.badge_status_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT EXECUTE ON FUNCTION public.change_badge_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_badge_status(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_pro_badge(text) TO anon, authenticated, service_role;
