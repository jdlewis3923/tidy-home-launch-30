-- New Pro kit standard: per-service contents, opt-in vehicle magnets for all
-- three services, a signed vehicle advertising agreement, an automatic kit
-- order summary, a badge photo upload token, and an admin legal-review list.

ALTER TABLE public.pro_kit
  ADD COLUMN IF NOT EXISTS shirt_size TEXT,
  ADD COLUMN IF NOT EXISTS shirt_cut TEXT,
  ADD COLUMN IF NOT EXISTS magnets_opt_in BOOLEAN,
  ADD COLUMN IF NOT EXISTS magnet_test TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_make TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_ad_signed_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_ad_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kit_summary TEXT,
  ADD COLUMN IF NOT EXISTS badge_photo_token TEXT,
  ADD COLUMN IF NOT EXISTS badge_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS badge_photo_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pro_confirm_email_sent_at TIMESTAMPTZ;

-- Backfill: the shirt question replaces the separate polo/tee size questions.
UPDATE public.pro_kit SET shirt_size = COALESCE(shirt_size, polo_size, tee_size),
                          shirt_cut  = COALESCE(shirt_cut, polo_cut, tee_cut)
WHERE shirt_size IS NULL OR shirt_cut IS NULL;

COMMENT ON COLUMN public.pro_kit.polo_size IS 'DEPRECATED: replaced by shirt_size';
COMMENT ON COLUMN public.pro_kit.polo_cut IS 'DEPRECATED: replaced by shirt_cut';
COMMENT ON COLUMN public.pro_kit.tee_size IS 'DEPRECATED: replaced by shirt_size';
COMMENT ON COLUMN public.pro_kit.tee_cut IS 'DEPRECATED: replaced by shirt_cut';

CREATE UNIQUE INDEX IF NOT EXISTS pro_kit_badge_photo_token_key ON public.pro_kit (badge_photo_token);

-- Mint a badge photo token for every kit row, now and going forward.
UPDATE public.pro_kit SET badge_photo_token = public.gen_onboarding_token() WHERE badge_photo_token IS NULL;

CREATE OR REPLACE FUNCTION public.pro_kit_ensure_badge_token()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.badge_photo_token IS NULL THEN
    NEW.badge_photo_token := public.gen_onboarding_token();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pro_kit_badge_token ON public.pro_kit;
CREATE TRIGGER trg_pro_kit_badge_token BEFORE INSERT ON public.pro_kit
  FOR EACH ROW EXECUTE FUNCTION public.pro_kit_ensure_badge_token();

-- Public intake save: accept the new shirt, magnet, vehicle and agreement fields.
CREATE OR REPLACE FUNCTION public.intake_save(_token text, _patch jsonb, _submit boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE r public.pro_kit; p jsonb := coalesce(_patch, '{}'::jsonb);
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN RETURN jsonb_build_object('state','not_found'); END IF;
  SELECT * INTO r FROM public.pro_kit WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
  IF r.token_expires_at IS NOT NULL AND r.token_expires_at < now() THEN RETURN jsonb_build_object('state','expired'); END IF;
  IF r.status <> 'sent' THEN RETURN jsonb_build_object('state','closed'); END IF;

  UPDATE public.pro_kit SET
    legal_name    = CASE WHEN p ? 'legal_name'    THEN nullif(p->>'legal_name','')    ELSE legal_name END,
    badge_name    = CASE WHEN p ? 'badge_name'    THEN nullif(p->>'badge_name','')    ELSE badge_name END,
    mobile        = CASE WHEN p ? 'mobile'        THEN nullif(p->>'mobile','')        ELSE mobile END,
    email         = CASE WHEN p ? 'email'         THEN nullif(p->>'email','')         ELSE email END,
    home_zip      = CASE WHEN p ? 'home_zip'      THEN nullif(p->>'home_zip','')      ELSE home_zip END,
    mail_address  = CASE WHEN p ? 'mail_address'  THEN nullif(p->>'mail_address','')  ELSE mail_address END,
    badge_back    = CASE WHEN p ? 'badge_back'    THEN nullif(p->>'badge_back','')    ELSE badge_back END,
    shirt_size    = CASE WHEN p ? 'shirt_size'    THEN nullif(p->>'shirt_size','')    ELSE shirt_size END,
    shirt_cut     = CASE WHEN p ? 'shirt_cut'     THEN nullif(p->>'shirt_cut','')     ELSE shirt_cut END,
    vest_size     = CASE WHEN p ? 'vest_size'     THEN nullif(p->>'vest_size','')     ELSE vest_size END,
    cap           = CASE WHEN p ? 'cap'           THEN nullif(p->>'cap','')           ELSE cap END,
    magnets_opt_in = CASE WHEN p ? 'magnets_opt_in' THEN (p->>'magnets_opt_in')::boolean ELSE magnets_opt_in END,
    magnet_test   = CASE WHEN p ? 'magnet_test'   THEN nullif(p->>'magnet_test','')   ELSE magnet_test END,
    vehicle       = CASE WHEN p ? 'vehicle'       THEN nullif(p->>'vehicle','')       ELSE vehicle END,
    vehicle_year  = CASE WHEN p ? 'vehicle_year'  THEN nullif(p->>'vehicle_year','')  ELSE vehicle_year END,
    vehicle_make  = CASE WHEN p ? 'vehicle_make'  THEN nullif(p->>'vehicle_make','')  ELSE vehicle_make END,
    vehicle_model = CASE WHEN p ? 'vehicle_model' THEN nullif(p->>'vehicle_model','') ELSE vehicle_model END,
    vehicle_color = CASE WHEN p ? 'vehicle_color' THEN nullif(p->>'vehicle_color','') ELSE vehicle_color END,
    vehicle_2     = CASE WHEN p ? 'vehicle_2'     THEN nullif(p->>'vehicle_2','')     ELSE vehicle_2 END,
    door_material = CASE WHEN p ? 'door_material' THEN nullif(p->>'door_material','') ELSE door_material END,
    vehicle_ad_signed_name = CASE WHEN p ? 'vehicle_ad_signed_name' THEN nullif(p->>'vehicle_ad_signed_name','') ELSE vehicle_ad_signed_name END,
    vehicle_ad_signed_at = CASE
      WHEN p ? 'vehicle_ad_signed_name' AND nullif(p->>'vehicle_ad_signed_name','') IS NOT NULL
        THEN coalesce(vehicle_ad_signed_at, now())
      ELSE vehicle_ad_signed_at END,
    service_line  = CASE WHEN p ? 'service_line'  THEN nullif(p->>'service_line','')  ELSE service_line END,
    cross_trained = CASE WHEN p ? 'cross_trained' THEN (p->>'cross_trained')::boolean ELSE cross_trained END,
    cross_which   = CASE WHEN p ? 'cross_which'   THEN nullif(p->>'cross_which','')   ELSE cross_which END,
    equip_confirmed = CASE WHEN p ? 'equip_confirmed' THEN (p->>'equip_confirmed')::boolean ELSE equip_confirmed END,
    equip_gap     = CASE WHEN p ? 'equip_gap'     THEN nullif(p->>'equip_gap','')     ELSE equip_gap END,
    ins_carrier   = CASE WHEN p ? 'ins_carrier'   THEN nullif(p->>'ins_carrier','')   ELSE ins_carrier END,
    ins_policy    = CASE WHEN p ? 'ins_policy'    THEN nullif(p->>'ins_policy','')    ELSE ins_policy END,
    ins_expiry    = CASE WHEN p ? 'ins_expiry'    THEN nullif(p->>'ins_expiry','')::date ELSE ins_expiry END,
    dl_number     = CASE WHEN p ? 'dl_number'     THEN nullif(p->>'dl_number','')     ELSE dl_number END,
    dl_expiry     = CASE WHEN p ? 'dl_expiry'     THEN nullif(p->>'dl_expiry','')::date ELSE dl_expiry END,
    auto_insurance = CASE WHEN p ? 'auto_insurance' THEN nullif(p->>'auto_insurance','') ELSE auto_insurance END,
    days          = CASE WHEN p ? 'days'          THEN p->'days'                      ELSE days END,
    hours         = CASE WHEN p ? 'hours'         THEN nullif(p->>'hours','')         ELSE hours END,
    visits_per_week = CASE WHEN p ? 'visits_per_week' THEN nullif(p->>'visits_per_week','')::int ELSE visits_per_week END,
    max_drive     = CASE WHEN p ? 'max_drive'     THEN nullif(p->>'max_drive','')     ELSE max_drive END,
    other_work    = CASE WHEN p ? 'other_work'    THEN nullif(p->>'other_work','')    ELSE other_work END,
    first_available = CASE WHEN p ? 'first_available' THEN nullif(p->>'first_available','')::date ELSE first_available END,
    status        = CASE WHEN _submit THEN 'submitted' ELSE status END,
    submitted_at  = CASE WHEN _submit THEN coalesce(submitted_at, now()) ELSE submitted_at END
  WHERE id = r.id;

  RETURN jsonb_build_object('state', CASE WHEN _submit THEN 'submitted' ELSE 'saved' END);
END; $function$;

-- Badge photo: token-scoped load so the Pro can open the upload page.
CREATE OR REPLACE FUNCTION public.badge_photo_load(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.pro_kit;
BEGIN
  IF _token IS NULL OR length(_token) < 20 THEN RETURN jsonb_build_object('state','not_found'); END IF;
  SELECT * INTO r FROM public.pro_kit WHERE badge_photo_token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
  RETURN jsonb_build_object(
    'state', CASE WHEN r.badge_photo_path IS NOT NULL THEN 'uploaded' ELSE 'open' END,
    'badge_name', r.badge_name,
    'service_line', r.service_line,
    'uploaded_at', r.badge_photo_uploaded_at
  );
END; $$;

REVOKE ALL ON FUNCTION public.badge_photo_load(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.badge_photo_load(text) TO anon, authenticated, service_role;

-- Open legal-review list surfaced in the admin.
CREATE TABLE IF NOT EXISTS public.legal_review_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  detail TEXT,
  document_ref TEXT,
  trigger_note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_note TEXT
);

GRANT SELECT, INSERT, UPDATE ON public.legal_review_items TO authenticated;
GRANT ALL ON public.legal_review_items TO service_role;
ALTER TABLE public.legal_review_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage legal review items" ON public.legal_review_items;
CREATE POLICY "Admins manage legal review items" ON public.legal_review_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));