-- Pro onboarding: one email, three token links, reminder tracking.

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS coi_token text,
  ADD COLUMN IF NOT EXISTS coi_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_reminder_last_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS applicants_coi_token_key
  ON public.applicants (coi_token) WHERE coi_token IS NOT NULL;

ALTER TABLE public.pro_kit
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;

UPDATE public.pro_kit
   SET token_expires_at = created_at + interval '30 days'
 WHERE token_expires_at IS NULL;

-- Long random URL-safe token (24 random bytes).
CREATE OR REPLACE FUNCTION public.gen_onboarding_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT rtrim(translate(encode(gen_random_bytes(24), 'base64'), '+/', '-_'), '=')
$$;

-- Token-scoped read for the public /coi/:token page. No auth, and nothing
-- beyond the Pro's own first name and their own certificate state.
CREATE OR REPLACE FUNCTION public.coi_token_load(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE a public.applicants;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  SELECT * INTO a FROM public.applicants WHERE coi_token = _token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;
  IF a.coi_token_expires_at IS NOT NULL AND a.coi_token_expires_at < now() THEN
    RETURN jsonb_build_object('state', 'expired');
  END IF;
  RETURN jsonb_build_object(
    'state', 'open',
    'first_name', a.first_name,
    'coi_review_status', coalesce(a.coi_review_status, 'pending_upload'),
    'carrier_name', a.coi_carrier_name,
    'policy_number', a.coi_policy_number,
    'effective_date', a.coi_effective_date,
    'expires_at', a.coi_expires_at,
    'has_certificate', a.coi_pdf_url IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coi_token_load(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coi_token_load(text) TO anon, authenticated, service_role;

-- Admin mint / regenerate for both onboarding links. Creates the pro_kit row
-- when one does not exist yet, so /intake/:token always resolves.
CREATE OR REPLACE FUNCTION public.admin_onboarding_tokens(_applicant_id uuid, _regenerate boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.applicants;
  k public.pro_kit;
  exp timestamptz := now() + interval '30 days';
BEGIN
  IF NOT public.is_privileged_caller() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO a FROM public.applicants WHERE id = _applicant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'applicant_not_found'; END IF;

  IF _regenerate OR a.coi_token IS NULL
     OR a.coi_token_expires_at IS NULL OR a.coi_token_expires_at < now() THEN
    UPDATE public.applicants
       SET coi_token = public.gen_onboarding_token(),
           coi_token_expires_at = exp
     WHERE id = _applicant_id
     RETURNING * INTO a;
  END IF;

  SELECT * INTO k FROM public.pro_kit WHERE applicant_id = _applicant_id
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.pro_kit (applicant_id, token_expires_at, legal_name, email, mobile)
    VALUES (_applicant_id, exp,
            nullif(trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')), ''),
            a.email, a.phone)
    RETURNING * INTO k;
  ELSIF _regenerate OR k.token_expires_at IS NULL OR k.token_expires_at < now() THEN
    UPDATE public.pro_kit
       SET token = public.gen_onboarding_token(), token_expires_at = exp
     WHERE id = k.id
     RETURNING * INTO k;
  END IF;

  RETURN jsonb_build_object(
    'coi_token', a.coi_token,
    'coi_token_expires_at', a.coi_token_expires_at,
    'intake_token', k.token,
    'intake_token_expires_at', k.token_expires_at,
    'intake_status', k.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_onboarding_tokens(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_onboarding_tokens(uuid, boolean) TO authenticated, service_role;

-- Teach the existing intake token functions about the 30-day expiry. Patched
-- from the live definitions so good copy in those bodies is preserved; the
-- anchor check makes a no-op replace fail loudly instead of silently.
DO $patch$
DECLARE src text; patched text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['intake_load', 'intake_save'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF src IS NULL THEN RAISE EXCEPTION 'function public.% not found', fn; END IF;

    patched := replace(
      src,
      'IF r.status <> ''sent'' THEN RETURN jsonb_build_object(''state'',''closed''); END IF;',
      'IF r.token_expires_at IS NOT NULL AND r.token_expires_at < now() THEN RETURN jsonb_build_object(''state'',''expired''); END IF;
   IF r.status <> ''sent'' THEN RETURN jsonb_build_object(''state'',''closed''); END IF;'
    );
    IF patched = src THEN
      RAISE EXCEPTION 'expiry guard anchor not found in public.%', fn;
    END IF;
    EXECUTE patched;
  END LOOP;
END
$patch$;