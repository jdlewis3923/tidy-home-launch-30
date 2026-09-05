CREATE OR REPLACE FUNCTION public.gen_intake_token()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT rtrim(translate(encode(gen_random_bytes(16), 'base64'), '+/', '-_'), '=')
$$;

CREATE TABLE public.pro_kit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT public.gen_intake_token(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','submitted','kit_ordered','kit_issued')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  legal_name text, badge_name text, mobile text, email text, home_zip text,
  mail_address text, pro_no text, badge_back text,
  polo_size text, polo_cut text, tee_size text, tee_cut text, vest_size text, cap text,
  vehicle text, vehicle_color text, vehicle_2 text, door_material text,
  service_line text, cross_trained boolean, cross_which text,
  equip_confirmed boolean, equip_gap text,
  ins_carrier text, ins_policy text, ins_expiry date,
  coi_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkr_sent date, checkr_cleared date, ica_signed date,
  dl_number text, dl_expiry date, auto_insurance text,
  days jsonb NOT NULL DEFAULT '[]'::jsonb,
  hours text, visits_per_week integer, max_drive text, other_work text,
  first_available date,
  kit_issued jsonb NOT NULL DEFAULT '[]'::jsonb,
  kit_done jsonb NOT NULL DEFAULT '[]'::jsonb,
  issued_date date, issued_by text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_kit TO authenticated;
GRANT ALL ON public.pro_kit TO service_role;

ALTER TABLE public.pro_kit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pro kits"
ON public.pro_kit FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX pro_kit_applicant_idx ON public.pro_kit (applicant_id);
CREATE INDEX pro_kit_status_idx ON public.pro_kit (status, submitted_at DESC);

CREATE OR REPLACE FUNCTION public.intake_load(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.pro_kit;
BEGIN
  IF _token IS NULL OR length(_token) < 10 THEN RETURN jsonb_build_object('state','not_found'); END IF;
  SELECT * INTO r FROM public.pro_kit WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
  IF r.status <> 'sent' THEN RETURN jsonb_build_object('state','closed'); END IF;
  RETURN jsonb_build_object('state','open', 'row',
    to_jsonb(r) - 'id' - 'token' - 'coi_checks' - 'checkr_sent' - 'checkr_cleared'
      - 'ica_signed' - 'kit_issued' - 'kit_done' - 'issued_date' - 'issued_by'
      - 'applicant_id' - 'pro_no');
END; $$;

CREATE OR REPLACE FUNCTION public.intake_save(_token text, _patch jsonb, _submit boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.pro_kit; p jsonb := coalesce(_patch, '{}'::jsonb);
BEGIN
  SELECT * INTO r FROM public.pro_kit WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
  IF r.status <> 'sent' THEN RETURN jsonb_build_object('state','closed'); END IF;

  UPDATE public.pro_kit SET
    legal_name    = CASE WHEN p ? 'legal_name'    THEN nullif(p->>'legal_name','')    ELSE legal_name END,
    badge_name    = CASE WHEN p ? 'badge_name'    THEN nullif(p->>'badge_name','')    ELSE badge_name END,
    mobile        = CASE WHEN p ? 'mobile'        THEN nullif(p->>'mobile','')        ELSE mobile END,
    email         = CASE WHEN p ? 'email'         THEN nullif(p->>'email','')         ELSE email END,
    home_zip      = CASE WHEN p ? 'home_zip'      THEN nullif(p->>'home_zip','')      ELSE home_zip END,
    mail_address  = CASE WHEN p ? 'mail_address'  THEN nullif(p->>'mail_address','')  ELSE mail_address END,
    badge_back    = CASE WHEN p ? 'badge_back'    THEN nullif(p->>'badge_back','')    ELSE badge_back END,
    polo_size     = CASE WHEN p ? 'polo_size'     THEN nullif(p->>'polo_size','')     ELSE polo_size END,
    polo_cut      = CASE WHEN p ? 'polo_cut'      THEN nullif(p->>'polo_cut','')      ELSE polo_cut END,
    tee_size      = CASE WHEN p ? 'tee_size'      THEN nullif(p->>'tee_size','')      ELSE tee_size END,
    tee_cut       = CASE WHEN p ? 'tee_cut'       THEN nullif(p->>'tee_cut','')       ELSE tee_cut END,
    vest_size     = CASE WHEN p ? 'vest_size'     THEN nullif(p->>'vest_size','')     ELSE vest_size END,
    cap           = CASE WHEN p ? 'cap'           THEN nullif(p->>'cap','')           ELSE cap END,
    vehicle       = CASE WHEN p ? 'vehicle'       THEN nullif(p->>'vehicle','')       ELSE vehicle END,
    vehicle_color = CASE WHEN p ? 'vehicle_color' THEN nullif(p->>'vehicle_color','') ELSE vehicle_color END,
    vehicle_2     = CASE WHEN p ? 'vehicle_2'     THEN nullif(p->>'vehicle_2','')     ELSE vehicle_2 END,
    door_material = CASE WHEN p ? 'door_material' THEN nullif(p->>'door_material','') ELSE door_material END,
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
    days          = CASE WHEN p ? 'days'          THEN coalesce(p->'days','[]'::jsonb) ELSE days END,
    hours         = CASE WHEN p ? 'hours'         THEN nullif(p->>'hours','')         ELSE hours END,
    visits_per_week = CASE WHEN p ? 'visits_per_week' THEN nullif(p->>'visits_per_week','')::int ELSE visits_per_week END,
    max_drive     = CASE WHEN p ? 'max_drive'     THEN nullif(p->>'max_drive','')     ELSE max_drive END,
    other_work    = CASE WHEN p ? 'other_work'    THEN nullif(p->>'other_work','')    ELSE other_work END,
    first_available = CASE WHEN p ? 'first_available' THEN nullif(p->>'first_available','')::date ELSE first_available END,
    status        = CASE WHEN _submit THEN 'submitted' ELSE status END,
    submitted_at  = CASE WHEN _submit THEN now() ELSE submitted_at END
  WHERE token = _token
  RETURNING * INTO r;

  RETURN jsonb_build_object('state', CASE WHEN _submit THEN 'submitted' ELSE 'open' END, 'id', r.id);
END; $$;

REVOKE ALL ON FUNCTION public.intake_load(text) FROM public;
REVOKE ALL ON FUNCTION public.intake_save(text, jsonb, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.intake_load(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.intake_save(text, jsonb, boolean) TO anon, authenticated, service_role;