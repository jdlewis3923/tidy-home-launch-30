-- Contract signing, badge photo review, Pro numbers at contract, admin field audit.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS contract_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS contract_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS contract_signed_name text,
  ADD COLUMN IF NOT EXISTS contract_signed_ip text,
  ADD COLUMN IF NOT EXISTS contract_signed_ua text,
  ADD COLUMN IF NOT EXISTS contract_doc_version text,
  ADD COLUMN IF NOT EXISTS contract_signed_pdf_path text,
  ADD COLUMN IF NOT EXISTS pro_number_reserved text,
  ADD COLUMN IF NOT EXISTS score_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gate_confirmations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS all_set_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS chase_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chase_last_at timestamptz,
  ADD COLUMN IF NOT EXISTS chase_alerted_at timestamptz,
  ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE public.pro_kit
  ADD COLUMN IF NOT EXISTS badge_photo_status text,
  ADD COLUMN IF NOT EXISTS badge_photo_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS badge_photo_retake_reason text,
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

UPDATE public.pro_kit SET badge_photo_status = 'pending'
 WHERE badge_photo_path IS NOT NULL AND badge_photo_status IS NULL;

-- Signed contracts, one row per signature (history kept).
CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  typed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  document_id uuid,
  document_version text NOT NULL,
  signed_pdf_path text
);
GRANT SELECT ON public.contract_signatures TO authenticated;
GRANT ALL ON public.contract_signatures TO service_role;
ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read signatures" ON public.contract_signatures
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Field audit.
CREATE TABLE IF NOT EXISTS public.applicant_field_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS applicant_field_audit_app_idx ON public.applicant_field_audit(applicant_id, changed_at DESC);
GRANT SELECT ON public.applicant_field_audit TO authenticated;
GRANT ALL ON public.applicant_field_audit TO service_role;
ALTER TABLE public.applicant_field_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.applicant_field_audit
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.audit_admin_field_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  k text;
  o jsonb := to_jsonb(OLD);
  n jsonb := to_jsonb(NEW);
  app uuid;
  skip text[] := ARRAY['updated_at','stage_entered_at','created_at'];
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN RETURN NEW; END IF;
  app := CASE WHEN TG_TABLE_NAME = 'applicants' THEN NEW.id ELSE (n->>'applicant_id')::uuid END;
  IF app IS NULL THEN RETURN NEW; END IF;
  FOR k IN SELECT jsonb_object_keys(n) LOOP
    IF k = ANY(skip) OR k LIKE '%token%' THEN CONTINUE; END IF;
    IF (o->k) IS DISTINCT FROM (n->k) THEN
      INSERT INTO public.applicant_field_audit(applicant_id, field, old_value, new_value, changed_by)
      VALUES (app, CASE WHEN TG_TABLE_NAME='pro_kit' THEN 'kit.'||k ELSE k END, o->>k, n->>k, uid);
      INSERT INTO public.admin_workday_events(event_type, applicant_id, actor_type, actor_user_id, title, detail, status)
      VALUES ('field_edited', app, 'admin', uid, 'Edited '||replace(k,'_',' '),
              coalesce(o->>k,'—')||' → '||coalesce(n->>k,'—'), 'done');
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_applicant_fields ON public.applicants;
CREATE TRIGGER trg_audit_applicant_fields AFTER UPDATE ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_field_change();
DROP TRIGGER IF EXISTS trg_audit_kit_fields ON public.pro_kit;
CREATE TRIGGER trg_audit_kit_fields AFTER UPDATE ON public.pro_kit
  FOR EACH ROW EXECUTE FUNCTION public.audit_admin_field_change();

-- Pro numbers: assigned at contract signing, never on test rows, never reused.
CREATE SEQUENCE IF NOT EXISTS public.pro_number_seq_v2 START 2;
GRANT USAGE ON SEQUENCE public.pro_number_seq_v2 TO service_role;

CREATE OR REPLACE FUNCTION public.assign_pro_badge_identifiers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.verify_token IS NULL OR NEW.verify_token = '' THEN
    NEW.verify_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  IF (NEW.pro_number IS NULL OR NEW.pro_number = '')
     AND coalesce(NEW.is_test_row, false) = false
     AND NEW.current_stage IN ('contract_signed','oriented','active') THEN
    NEW.pro_number := coalesce(NULLIF(NEW.pro_number_reserved,''),
      'TIDY-' || lpad(pg_catalog.nextval('public.pro_number_seq_v2'::regclass)::text, 4, '0'));
    IF NEW.pro_since IS NULL THEN NEW.pro_since := CURRENT_DATE; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_pro_badge_identifiers ON public.applicants;
CREATE TRIGGER trg_assign_pro_badge_identifiers BEFORE INSERT OR UPDATE ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.assign_pro_badge_identifiers();

-- Contract page loader (public, token only).
CREATE OR REPLACE FUNCTION public.contract_load(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'state', CASE WHEN a.contracts_signed THEN 'signed' ELSE 'open' END,
      'first_name', a.first_name,
      'signed_at', a.contracts_signed_at)
    FROM public.applicants a WHERE a.contract_token = _token AND length(_token) >= 20
  ), jsonb_build_object('state','not_found'));
$$;
GRANT EXECUTE ON FUNCTION public.contract_load(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.badge_photo_load(_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'state', CASE WHEN k.badge_photo_status = 'approved' THEN 'approved'
                    WHEN k.badge_photo_status = 'retake_requested' THEN 'open'
                    WHEN k.badge_photo_path IS NOT NULL THEN 'uploaded' ELSE 'open' END,
      'badge_name', k.badge_name,
      'retake_reason', CASE WHEN k.badge_photo_status='retake_requested' THEN k.badge_photo_retake_reason END)
    FROM public.pro_kit k WHERE k.badge_photo_token = _token AND length(_token) >= 20
  ), jsonb_build_object('state','not_found'));
$$;
GRANT EXECUTE ON FUNCTION public.badge_photo_load(text) TO anon, authenticated;