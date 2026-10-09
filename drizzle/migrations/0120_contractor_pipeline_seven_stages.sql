-- Contractor onboarding pipeline: seven ordered stages, server-enforced.
-- Stage, state and archive flags change ONLY inside the pipeline_* functions
-- (they set tidy.pipeline_move for the transaction); any other write is refused.

CREATE TABLE public.contractor_pipeline (
  applicant_id uuid PRIMARY KEY REFERENCES public.applicants(id) ON DELETE CASCADE,
  stage text NOT NULL DEFAULT 'applied'
    CHECK (stage IN ('applied','screened','agreement','ins_quote','background','insured','active')),
  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open','hold','declined','withdrawn','lapsed')),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  activated_at timestamptz,
  service text CHECK (service IN ('cleaning','lawn','car_care')),
  source text CHECK (source IN ('indeed','hanger','referral','other')),
  apply_submitted_at timestamptz,
  screening_call_completed_at timestamptz,
  call_notes text,
  owns_equipment boolean,
  drive_time_minutes integer CHECK (drive_time_minutes IS NULL OR drive_time_minutes >= 0),
  screening_decision text CHECK (screening_decision IN ('advance','hold','decline')),
  hold_reason text,
  hold_callback_date date,
  decline_reason text,
  decline_note text,
  withdrawn_note text,
  ica_countersigned_at timestamptz,
  welcome_t1_sent_at timestamptz,
  quote_carrier text,
  quote_limit_occurrence bigint,
  quote_limit_aggregate bigint,
  quote_names_tidy_as_ai boolean,
  spend_confirmed_at timestamptz,
  checkr_result text CHECK (checkr_result IN ('clear','consider','suspended')),
  coi_effective_date date,
  coi_expiry_date date,
  coi_limit_occurrence bigint,
  coi_limit_aggregate bigint,
  coi_names_tidy_as_ai boolean,
  insurance_reimbursement_start_month date,
  reimbursement_m1_paid_at timestamptz,
  reimbursement_m2_paid_at timestamptz,
  reimbursement_m3_paid_at timestamptz,
  kit_issued_at timestamptz,
  route_confirmed boolean NOT NULL DEFAULT false,
  service_days text[] NOT NULL DEFAULT '{}',
  pre_adverse_notice_sent_at date,
  report_and_rights_summary_provided boolean,
  adverse_action_notice_sent_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_hold_complete CHECK (state <> 'hold' OR (hold_reason IS NOT NULL AND length(trim(hold_reason)) > 0 AND hold_callback_date IS NOT NULL)),
  CONSTRAINT pipeline_decline_complete CHECK (state <> 'declined' OR (decline_reason IS NOT NULL AND archived)),
  CONSTRAINT pipeline_withdraw_complete CHECK (state <> 'withdrawn' OR (withdrawn_note IS NOT NULL AND length(trim(withdrawn_note)) > 0 AND archived))
);
GRANT SELECT ON public.contractor_pipeline TO authenticated;
GRANT ALL ON public.contractor_pipeline TO service_role;
ALTER TABLE public.contractor_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline admin read" ON public.contractor_pipeline FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.contractor_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ica_signed','w9','insurance_quote','checkr_report','coi')),
  storage_path text NOT NULL,
  file_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid
);
CREATE INDEX contractor_artifacts_applicant ON public.contractor_artifacts(applicant_id, kind);
GRANT SELECT ON public.contractor_artifacts TO authenticated;
GRANT ALL ON public.contractor_artifacts TO service_role;
ALTER TABLE public.contractor_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifacts admin read" ON public.contractor_artifacts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.contractor_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  category text NOT NULL CHECK (category IN ('background_check','kit')),
  spent_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_by uuid
);
CREATE INDEX contractor_spend_applicant ON public.contractor_spend(applicant_id);
GRANT SELECT ON public.contractor_spend TO authenticated;
GRANT ALL ON public.contractor_spend TO service_role;
ALTER TABLE public.contractor_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spend admin read" ON public.contractor_spend FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TABLE public.contractor_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('advance','activate','hold','resume','decline','withdraw','restore','override','lapse','reinstate','migrate','refused')),
  from_stage text,
  to_stage text,
  from_state text,
  to_state text,
  reason text,
  actor uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contractor_stage_events_applicant ON public.contractor_stage_events(applicant_id, created_at DESC);
GRANT SELECT ON public.contractor_stage_events TO authenticated;
GRANT ALL ON public.contractor_stage_events TO service_role;
ALTER TABLE public.contractor_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage events admin read" ON public.contractor_stage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ------------------------------------------------------------------ helpers
CREATE OR REPLACE FUNCTION public.pipeline_assert_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.is_service_caller()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_stage_index(_s text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['applied','screened','agreement','ins_quote','background','insured','active'], _s)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_stage_label(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s WHEN 'applied' THEN 'Applied' WHEN 'screened' THEN 'Screened' WHEN 'agreement' THEN 'Agreement'
    WHEN 'ins_quote' THEN 'Insurance quote' WHEN 'background' THEN 'Background check' WHEN 'insured' THEN 'Insured'
    WHEN 'active' THEN 'Active' ELSE _s END
$$;

CREATE OR REPLACE FUNCTION public.pipeline_service_label(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s WHEN 'cleaning' THEN 'Cleaning' WHEN 'lawn' THEN 'Lawn' WHEN 'car_care' THEN 'Car Care' ELSE coalesce(_s, 'Unknown') END
$$;

CREATE OR REPLACE FUNCTION public.pipeline_business_days_between(_from date, _to date) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT count(*)::int FROM generate_series(_from + 1, _to, interval '1 day') d
   WHERE extract(isodow FROM d) < 6
$$;

CREATE OR REPLACE FUNCTION public.pipeline_service_key(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_s,'')) WHEN 'cleaning' THEN 'cleaning' WHEN 'lawn' THEN 'lawn'
    WHEN 'car_care' THEN 'car_care' WHEN 'detailing' THEN 'car_care' WHEN 'car' THEN 'car_care' ELSE NULL END
$$;

-- Stage, state, archive and activation are writable only inside pipeline functions.
CREATE OR REPLACE FUNCTION public.pipeline_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('tidy.pipeline_move', true), '') = 'on' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage <> 'applied' OR NEW.state <> 'open' OR NEW.archived OR NEW.activated_at IS NOT NULL THEN
      RAISE EXCEPTION 'pipeline: new candidates start at applied' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.archived IS DISTINCT FROM OLD.archived OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.spend_confirmed_at IS DISTINCT FROM OLD.spend_confirmed_at THEN
    RAISE EXCEPTION 'pipeline: stage can only change through Advance, Hold, Decline, Withdraw or Override'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pipeline_guard BEFORE INSERT OR UPDATE ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_guard();

-- --------------------------------------------------------- exit requirements
CREATE OR REPLACE FUNCTION public.pipeline_missing(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; a public.applicants; m text[] := '{}';
  has_art boolean;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN ARRAY['no pipeline record']; END IF;

  IF p.stage = 'applied' THEN
    IF p.apply_submitted_at IS NULL THEN m := m || 'Application submitted through /apply'; END IF;
    IF p.service IS NULL THEN m := m || 'Service (cleaning, lawn or car care)'; END IF;
    IF coalesce(length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')), 0) < 10 THEN m := m || 'Phone'; END IF;
    IF coalesce(a.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN m := m || 'Email'; END IF;
    IF p.source IS NULL THEN m := m || 'Source (Indeed, hanger, referral or other)'; END IF;
  ELSIF p.stage = 'screened' THEN
    IF p.screening_call_completed_at IS NULL THEN m := m || 'Screening call completed'; END IF;
    IF length(trim(coalesce(p.call_notes, ''))) < 20 THEN m := m || 'Call notes (at least 20 characters)'; END IF;
    IF p.owns_equipment IS NULL THEN m := m || 'Owns equipment — answered yes or no'; END IF;
    IF p.drive_time_minutes IS NULL THEN m := m || 'Drive time recorded';
    ELSIF p.drive_time_minutes > 30 THEN m := m || 'Drive time is over 30 minutes'; END IF;
    IF coalesce(p.screening_decision, '') <> 'advance' THEN m := m || 'Screening decision: Advance'; END IF;
  ELSIF p.stage = 'agreement' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'ica_signed') INTO has_art;
    IF NOT has_art THEN m := m || 'Signed ICA uploaded'; END IF;
    IF p.ica_countersigned_at IS NULL THEN m := m || 'ICA countersigned'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'w9') INTO has_art;
    IF NOT has_art THEN m := m || 'W-9 uploaded'; END IF;
    IF p.welcome_t1_sent_at IS NULL THEN m := m || 'WELCOME-T1 sent'; END IF;
  ELSIF p.stage = 'ins_quote' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'insurance_quote') INTO has_art;
    IF NOT has_art THEN m := m || 'Insurance quote uploaded'; END IF;
    IF length(trim(coalesce(p.quote_carrier, ''))) = 0 THEN m := m || 'Quote carrier'; END IF;
    IF coalesce(p.quote_limit_occurrence, 0) < 1000000 THEN m := m || 'Quote per-occurrence limit of at least $1,000,000'; END IF;
    IF coalesce(p.quote_limit_aggregate, 0) < 2000000 THEN m := m || 'Quote aggregate limit of at least $2,000,000'; END IF;
    IF p.quote_names_tidy_as_ai IS NOT TRUE THEN m := m || 'Quote names Tidy as additional insured'; END IF;
  ELSIF p.stage = 'background' THEN
    IF p.spend_confirmed_at IS NULL THEN m := m || 'Background check spend confirmed'; END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'checkr_report') INTO has_art;
    IF NOT has_art THEN m := m || 'Checkr report uploaded'; END IF;
    IF p.checkr_result IS NULL THEN m := m || 'Checkr result recorded';
    ELSIF p.checkr_result <> 'clear' THEN m := m || 'Checkr result must be clear to advance'; END IF;
  ELSIF p.stage = 'insured' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'coi') INTO has_art;
    IF NOT has_art THEN m := m || 'Certificate of insurance uploaded'; END IF;
    IF p.coi_effective_date IS NULL THEN m := m || 'COI effective date'; END IF;
    IF p.coi_expiry_date IS NULL THEN m := m || 'COI expiry date';
    ELSIF p.coi_expiry_date <= current_date THEN m := m || 'COI expiry date must be in the future'; END IF;
    IF coalesce(p.coi_limit_occurrence, 0) < 1000000 THEN m := m || 'COI per-occurrence limit of at least $1,000,000'; END IF;
    IF coalesce(p.coi_limit_aggregate, 0) < 2000000 THEN m := m || 'COI aggregate limit of at least $2,000,000'; END IF;
    IF p.coi_names_tidy_as_ai IS NOT TRUE THEN m := m || 'COI names Tidy as additional insured'; END IF;
    IF p.insurance_reimbursement_start_month IS NULL THEN m := m || 'Insurance reimbursement start month'; END IF;
  ELSIF p.stage = 'active' THEN
    IF p.kit_issued_at IS NULL THEN m := m || 'Kit issued'; END IF;
    IF coalesce(a.pro_number, '') !~ '^TIDY-\d{4}$' THEN m := m || 'Badge number assigned (TIDY-0000)'; END IF;
    IF NOT p.route_confirmed OR coalesce(array_length(p.service_days, 1), 0) = 0 THEN m := m || 'Route confirmed with service days'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contractor_spend WHERE applicant_id = _id AND category = 'kit') THEN m := m || 'Kit spend recorded'; END IF;
  END IF;
  RETURN m;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_log(_id uuid, _kind text, _from_stage text, _to_stage text,
  _from_state text, _to_state text, _reason text, _meta jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.contractor_stage_events(applicant_id, kind, from_stage, to_stage, from_state, to_state, reason, actor, metadata)
  VALUES (_id, _kind, _from_stage, _to_stage, _from_state, _to_state, _reason, auth.uid(), coalesce(_meta, '{}'::jsonb))
$$;

-- Who already holds the one spend-gate slot for a service.
CREATE OR REPLACE FUNCTION public.pipeline_spend_lock_holder(_service text, _except uuid)
RETURNS TABLE(applicant_id uuid, name text, stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), p.stage
    FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
   WHERE p.service = _service AND p.applicant_id <> _except AND NOT p.archived
     AND (p.stage IN ('background','insured') OR (p.stage = 'active' AND p.activated_at IS NULL))
   ORDER BY p.stage_entered_at LIMIT 1
$$;

-- ------------------------------------------------------------------ advance
CREATE OR REPLACE FUNCTION public.pipeline_advance(_id uuid, _expected_to text DEFAULT NULL,
  _confirm_spend boolean DEFAULT false, _amount_cents integer DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; nm text; nxt text; miss text[]; h record; amt integer;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) INTO nm FROM public.applicants WHERE id = _id;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: % is archived — restore first', nm; END IF;
  IF p.state <> 'open' THEN RAISE EXCEPTION 'pipeline: % is on %; resume first', nm, p.state; END IF;

  nxt := CASE WHEN p.stage = 'active' THEN 'active'
    ELSE (ARRAY['applied','screened','agreement','ins_quote','background','insured','active'])[public.pipeline_stage_index(p.stage) + 1] END;

  IF _expected_to IS NOT NULL AND _expected_to <> nxt THEN
    PERFORM public.pipeline_log(_id, 'refused', p.stage, _expected_to, p.state, p.state,
      'only the next stage is allowed', jsonb_build_object('allowed', nxt));
    RAISE EXCEPTION 'pipeline: % is at % — the only stage allowed next is %; % is rejected',
      nm, public.pipeline_stage_label(p.stage), public.pipeline_stage_label(nxt), public.pipeline_stage_label(_expected_to)
      USING ERRCODE = '23514';
  END IF;

  miss := public.pipeline_missing(_id);
  IF coalesce(array_length(miss, 1), 0) > 0 THEN
    RAISE EXCEPTION 'pipeline: still missing — %', array_to_string(miss, '; ') USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('tidy.pipeline_move', 'on', true);

  IF p.stage = 'active' THEN
    IF p.activated_at IS NOT NULL THEN RAISE EXCEPTION 'pipeline: % is already active', nm; END IF;
    UPDATE public.contractor_pipeline SET activated_at = now() WHERE applicant_id = _id;
    UPDATE public.applicants SET current_stage = 'active' WHERE id = _id AND current_stage IS DISTINCT FROM 'active';
    PERFORM public.pipeline_log(_id, 'activate', 'active', 'active', 'open', 'open', NULL);
    RETURN jsonb_build_object('ok', true, 'stage', 'active', 'activated', true);
  END IF;

  IF nxt = 'background' THEN
    SELECT * INTO h FROM public.pipeline_spend_lock_holder(p.service, _id);
    IF h.applicant_id IS NOT NULL THEN
      PERFORM public.pipeline_log(_id, 'refused', p.stage, nxt, p.state, p.state, 'spend lock',
        jsonb_build_object('holder', h.applicant_id));
      RAISE EXCEPTION '% already has a candidate past the spend gate (%, stage %). Tidy hires one Pro per service; Pro #2 comes at 30 reservations. Override if this is deliberate.',
        public.pipeline_service_label(p.service), h.name, public.pipeline_stage_index(h.stage) USING ERRCODE = '23514';
    END IF;
    IF NOT _confirm_spend THEN RAISE EXCEPTION 'pipeline: spend confirmation required ($64.49)' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.contractor_spend(applicant_id, amount_cents, category, note, created_by)
      VALUES (_id, 6449, 'background_check', coalesce(_note, 'Checkr Essential'), auth.uid());
    UPDATE public.contractor_pipeline SET spend_confirmed_at = now() WHERE applicant_id = _id;
  ELSIF nxt = 'active' THEN
    amt := coalesce(_amount_cents, 6000);
    IF NOT _confirm_spend THEN RAISE EXCEPTION 'pipeline: kit spend confirmation required' USING ERRCODE = '23514'; END IF;
    IF amt <= 0 THEN RAISE EXCEPTION 'pipeline: kit amount must be above $0'; END IF;
    INSERT INTO public.contractor_spend(applicant_id, amount_cents, category, note, created_by)
      VALUES (_id, amt, 'kit', coalesce(_note, 'Pro kit'), auth.uid());
  END IF;

  UPDATE public.contractor_pipeline SET stage = nxt, stage_entered_at = now() WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'advance', p.stage, nxt, 'open', 'open', NULL);
  RETURN jsonb_build_object('ok', true, 'stage', nxt);
END $$;

-- ------------------------------------------------------- field edits (no stage)
CREATE OR REPLACE FUNCTION public.pipeline_update(_id uuid, _patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
  allowed text[] := ARRAY['service','source','apply_submitted_at','screening_call_completed_at','call_notes',
    'owns_equipment','drive_time_minutes','screening_decision','ica_countersigned_at','quote_carrier',
    'quote_limit_occurrence','quote_limit_aggregate','quote_names_tidy_as_ai','checkr_result',
    'coi_effective_date','coi_expiry_date','coi_limit_occurrence','coi_limit_aggregate','coi_names_tidy_as_ai',
    'insurance_reimbursement_start_month','reimbursement_m1_paid_at','reimbursement_m2_paid_at','reimbursement_m3_paid_at',
    'kit_issued_at','route_confirmed','service_days','phone','email'];
BEGIN
  PERFORM public.pipeline_assert_admin();
  FOR k IN SELECT jsonb_object_keys(_patch) LOOP
    IF NOT k = ANY(allowed) THEN RAISE EXCEPTION 'pipeline: % cannot be edited here', k USING ERRCODE = '42501'; END IF;
  END LOOP;
  IF _patch ? 'screening_decision' AND (_patch->>'screening_decision') IN ('hold','decline') THEN
    RAISE EXCEPTION 'pipeline: use Hold or Decline for that decision';
  END IF;
  UPDATE public.contractor_pipeline SET
    service = CASE WHEN _patch ? 'service' THEN _patch->>'service' ELSE service END,
    source = CASE WHEN _patch ? 'source' THEN _patch->>'source' ELSE source END,
    apply_submitted_at = CASE WHEN _patch ? 'apply_submitted_at' THEN (_patch->>'apply_submitted_at')::timestamptz ELSE apply_submitted_at END,
    screening_call_completed_at = CASE WHEN _patch ? 'screening_call_completed_at' THEN (_patch->>'screening_call_completed_at')::timestamptz ELSE screening_call_completed_at END,
    call_notes = CASE WHEN _patch ? 'call_notes' THEN _patch->>'call_notes' ELSE call_notes END,
    owns_equipment = CASE WHEN _patch ? 'owns_equipment' THEN (_patch->>'owns_equipment')::boolean ELSE owns_equipment END,
    drive_time_minutes = CASE WHEN _patch ? 'drive_time_minutes' THEN (_patch->>'drive_time_minutes')::integer ELSE drive_time_minutes END,
    screening_decision = CASE WHEN _patch ? 'screening_decision' THEN _patch->>'screening_decision' ELSE screening_decision END,
    ica_countersigned_at = CASE WHEN _patch ? 'ica_countersigned_at' THEN (_patch->>'ica_countersigned_at')::timestamptz ELSE ica_countersigned_at END,
    quote_carrier = CASE WHEN _patch ? 'quote_carrier' THEN _patch->>'quote_carrier' ELSE quote_carrier END,
    quote_limit_occurrence = CASE WHEN _patch ? 'quote_limit_occurrence' THEN (_patch->>'quote_limit_occurrence')::bigint ELSE quote_limit_occurrence END,
    quote_limit_aggregate = CASE WHEN _patch ? 'quote_limit_aggregate' THEN (_patch->>'quote_limit_aggregate')::bigint ELSE quote_limit_aggregate END,
    quote_names_tidy_as_ai = CASE WHEN _patch ? 'quote_names_tidy_as_ai' THEN (_patch->>'quote_names_tidy_as_ai')::boolean ELSE quote_names_tidy_as_ai END,
    checkr_result = CASE WHEN _patch ? 'checkr_result' THEN _patch->>'checkr_result' ELSE checkr_result END,
    coi_effective_date = CASE WHEN _patch ? 'coi_effective_date' THEN (_patch->>'coi_effective_date')::date ELSE coi_effective_date END,
    coi_expiry_date = CASE WHEN _patch ? 'coi_expiry_date' THEN (_patch->>'coi_expiry_date')::date ELSE coi_expiry_date END,
    coi_limit_occurrence = CASE WHEN _patch ? 'coi_limit_occurrence' THEN (_patch->>'coi_limit_occurrence')::bigint ELSE coi_limit_occurrence END,
    coi_limit_aggregate = CASE WHEN _patch ? 'coi_limit_aggregate' THEN (_patch->>'coi_limit_aggregate')::bigint ELSE coi_limit_aggregate END,
    coi_names_tidy_as_ai = CASE WHEN _patch ? 'coi_names_tidy_as_ai' THEN (_patch->>'coi_names_tidy_as_ai')::boolean ELSE coi_names_tidy_as_ai END,
    insurance_reimbursement_start_month = CASE WHEN _patch ? 'insurance_reimbursement_start_month' THEN (_patch->>'insurance_reimbursement_start_month')::date ELSE insurance_reimbursement_start_month END,
    reimbursement_m1_paid_at = CASE WHEN _patch ? 'reimbursement_m1_paid_at' THEN (_patch->>'reimbursement_m1_paid_at')::timestamptz ELSE reimbursement_m1_paid_at END,
    reimbursement_m2_paid_at = CASE WHEN _patch ? 'reimbursement_m2_paid_at' THEN (_patch->>'reimbursement_m2_paid_at')::timestamptz ELSE reimbursement_m2_paid_at END,
    reimbursement_m3_paid_at = CASE WHEN _patch ? 'reimbursement_m3_paid_at' THEN (_patch->>'reimbursement_m3_paid_at')::timestamptz ELSE reimbursement_m3_paid_at END,
    kit_issued_at = CASE WHEN _patch ? 'kit_issued_at' THEN (_patch->>'kit_issued_at')::timestamptz ELSE kit_issued_at END,
    route_confirmed = CASE WHEN _patch ? 'route_confirmed' THEN coalesce((_patch->>'route_confirmed')::boolean, false) ELSE route_confirmed END,
    service_days = CASE WHEN _patch ? 'service_days' THEN coalesce(ARRAY(SELECT jsonb_array_elements_text(_patch->'service_days')), '{}') ELSE service_days END
  WHERE applicant_id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  IF _patch ? 'phone' OR _patch ? 'email' THEN
    UPDATE public.applicants SET
      phone = CASE WHEN _patch ? 'phone' THEN _patch->>'phone' ELSE phone END,
      email = CASE WHEN _patch ? 'email' THEN lower(_patch->>'email') ELSE email END
    WHERE id = _id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_add_artifact(_id uuid, _kind text, _path text, _name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  PERFORM public.pipeline_assert_admin();
  INSERT INTO public.contractor_artifacts(applicant_id, kind, storage_path, file_name, uploaded_by)
    VALUES (_id, _kind, _path, _name, auth.uid()) RETURNING id INTO v;
  RETURN v;
END $$;

-- WELCOME-T1 delivery marks itself here (service only).
CREATE OR REPLACE FUNCTION public.pipeline_mark_welcome_sent(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  UPDATE public.contractor_pipeline SET welcome_t1_sent_at = coalesce(welcome_t1_sent_at, now()) WHERE applicant_id = _id;
END $$;

-- Fire WELCOME-T1 the moment ica_countersigned_at is written.
CREATE OR REPLACE FUNCTION public.pipeline_countersigned_welcome() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ica_countersigned_at IS NOT NULL AND OLD.ica_countersigned_at IS NULL AND NEW.welcome_t1_sent_at IS NULL THEN
    PERFORM public.call_edge_function('pipeline-welcome-t1', jsonb_build_object('applicant_id', NEW.applicant_id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pipeline_countersigned_welcome AFTER UPDATE OF ica_countersigned_at ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_countersigned_welcome();

-- ---------------------------------------------------------------- hold
CREATE OR REPLACE FUNCTION public.pipeline_hold(_id uuid, _reason text, _callback date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: archived candidates cannot be held'; END IF;
  IF p.state <> 'open' THEN RAISE EXCEPTION 'pipeline: only an open candidate can be put on hold'; END IF;
  IF length(trim(coalesce(_reason, ''))) = 0 THEN RAISE EXCEPTION 'pipeline: hold reason is required'; END IF;
  IF _callback IS NULL OR _callback <= current_date THEN RAISE EXCEPTION 'pipeline: callback date is required and must be in the future'; END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET state = 'hold', hold_reason = trim(_reason), hold_callback_date = _callback,
    screening_decision = CASE WHEN stage = 'screened' THEN 'hold' ELSE screening_decision END
   WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'hold', p.stage, p.stage, 'open', 'hold', _reason, jsonb_build_object('callback', _callback));
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_resume(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.state <> 'hold' THEN RAISE EXCEPTION 'pipeline: candidate is not on hold'; END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET state = 'open',
    screening_decision = CASE WHEN screening_decision = 'hold' THEN NULL ELSE screening_decision END
   WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'resume', p.stage, p.stage, 'hold', 'open', NULL);
END $$;

-- ------------------------------------------------------------ archive paths
CREATE OR REPLACE FUNCTION public.pipeline_archive_apply(_id uuid, _state text, _reason text, _note text, _meta jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; a public.applicants;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET state = _state, archived = true, archived_at = now(),
    decline_reason = CASE WHEN _state = 'declined' THEN _reason ELSE decline_reason END,
    decline_note = CASE WHEN _state = 'declined' THEN _note ELSE decline_note END,
    withdrawn_note = CASE WHEN _state = 'withdrawn' THEN _note ELSE withdrawn_note END,
    screening_decision = CASE WHEN stage = 'screened' AND _state = 'declined' THEN 'decline' ELSE screening_decision END
   WHERE applicant_id = _id;
  -- Legacy mirror: the old status reads "rejected" so every older count drops them too.
  UPDATE public.applicants SET current_stage = 'rejected', rejected_at = now(),
    rejection_reason = left(coalesce(_reason, 'Withdrew') || coalesce(': ' || nullif(_note, ''), ''), 500)
   WHERE id = _id;
  -- Open alerts about them stop appearing in the board, tiles and digests.
  UPDATE public.admin_alerts SET resolved_at = now()
   WHERE resolved_at IS NULL AND (context->>'applicant_id') = _id::text;
  PERFORM public.pipeline_log(_id, CASE WHEN _state = 'declined' THEN 'decline' ELSE 'withdraw' END,
    p.stage, p.stage, p.state, _state, coalesce(_reason, _note),
    coalesce(_meta, '{}'::jsonb) || jsonb_build_object('prev_state', p.state, 'prev_current_stage', a.current_stage,
      'prev_rejection_reason', a.rejection_reason, 'prev_rejected_at', a.rejected_at, 'note', _note));
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_decline(_id uuid, _reason text, _note text DEFAULT NULL,
  _pre_adverse date DEFAULT NULL, _rights_provided boolean DEFAULT NULL, _adverse date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; needs_fcra boolean;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: already archived'; END IF;
  IF _reason IS NULL OR _reason NOT IN ('No equipment','Out of range (over 30 minutes)','Unresponsive','Not a fit','Background check','Other') THEN
    RAISE EXCEPTION 'pipeline: pick a decline reason';
  END IF;
  IF _reason = 'Other' AND length(trim(coalesce(_note, ''))) = 0 THEN RAISE EXCEPTION 'pipeline: "Other" needs a written reason'; END IF;

  needs_fcra := public.pipeline_stage_index(p.stage) >= 5 AND _reason = 'Background check'
    AND EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'checkr_report');
  IF needs_fcra THEN
    IF _pre_adverse IS NULL THEN RAISE EXCEPTION 'pipeline: pre-adverse notice date is required (FCRA)'; END IF;
    IF _rights_provided IS NOT TRUE THEN RAISE EXCEPTION 'pipeline: confirm the report and summary of rights were provided (FCRA)'; END IF;
    IF _adverse IS NULL THEN RAISE EXCEPTION 'pipeline: adverse action notice date is required (FCRA)'; END IF;
    IF public.pipeline_business_days_between(_pre_adverse, _adverse) < 5 THEN
      RAISE EXCEPTION 'pipeline: adverse action notice must be at least 5 business days after the pre-adverse notice';
    END IF;
    PERFORM set_config('tidy.pipeline_move', 'on', true);
    UPDATE public.contractor_pipeline SET pre_adverse_notice_sent_at = _pre_adverse,
      report_and_rights_summary_provided = true, adverse_action_notice_sent_at = _adverse WHERE applicant_id = _id;
  END IF;
  PERFORM public.pipeline_archive_apply(_id, 'declined', _reason, nullif(trim(coalesce(_note, '')), ''),
    jsonb_build_object('fcra', needs_fcra));
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_withdraw(_id uuid, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: already archived'; END IF;
  IF length(trim(coalesce(_note, ''))) = 0 THEN RAISE EXCEPTION 'pipeline: a note is required'; END IF;
  PERFORM public.pipeline_archive_apply(_id, 'withdrawn', NULL, trim(_note), '{}'::jsonb);
END $$;

-- Undo / Restore: back to the exact stage and state they had.
CREATE OR REPLACE FUNCTION public.pipeline_restore(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; e public.contractor_stage_events; prev text;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF NOT coalesce(p.archived, false) THEN RAISE EXCEPTION 'pipeline: candidate is not archived'; END IF;
  SELECT * INTO e FROM public.contractor_stage_events WHERE applicant_id = _id AND kind IN ('decline','withdraw','migrate')
   ORDER BY created_at DESC LIMIT 1;
  prev := coalesce(e.metadata->>'prev_state', 'open');
  IF prev NOT IN ('open','hold','lapsed') THEN prev := 'open'; END IF;
  IF prev = 'hold' AND (p.hold_reason IS NULL OR p.hold_callback_date IS NULL) THEN prev := 'open'; END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET state = prev, archived = false, archived_at = NULL,
    screening_decision = CASE WHEN screening_decision = 'decline' THEN NULL ELSE screening_decision END
   WHERE applicant_id = _id;
  UPDATE public.applicants SET current_stage = coalesce(nullif(e.metadata->>'prev_current_stage', 'rejected'), 'applied'),
    rejection_reason = e.metadata->>'prev_rejection_reason', rejected_at = (e.metadata->>'prev_rejected_at')::timestamptz
   WHERE id = _id AND e.id IS NOT NULL AND e.kind <> 'migrate';
  PERFORM public.pipeline_log(_id, 'restore', p.stage, p.stage, p.state, prev, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_bulk_decline(_ids uuid[], _reason text, _note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i uuid; n integer := 0;
BEGIN
  PERFORM public.pipeline_assert_admin();
  IF (SELECT count(DISTINCT stage) FROM public.contractor_pipeline WHERE applicant_id = ANY(_ids)) > 1 THEN
    RAISE EXCEPTION 'pipeline: bulk decline works within one column';
  END IF;
  FOREACH i IN ARRAY _ids LOOP
    PERFORM public.pipeline_decline(i, _reason, _note);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- -------------------------------------------------------------- override
CREATE OR REPLACE FUNCTION public.pipeline_override(_id uuid, _to_stage text, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  IF length(trim(coalesce(_reason, ''))) < 15 THEN RAISE EXCEPTION 'pipeline: override reason must be at least 15 characters'; END IF;
  IF public.pipeline_stage_index(_to_stage) IS NULL THEN RAISE EXCEPTION 'pipeline: unknown stage %', _to_stage; END IF;
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: restore the candidate before overriding'; END IF;
  IF p.stage = _to_stage THEN RAISE EXCEPTION 'pipeline: already at that stage'; END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET stage = _to_stage, stage_entered_at = now(),
    activated_at = CASE WHEN _to_stage = 'active' THEN activated_at ELSE NULL END
   WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'override', p.stage, _to_stage, p.state, p.state, trim(_reason));
END $$;

-- COI-lapsed Pro returns to active once a new, valid COI is on file (no override).
CREATE OR REPLACE FUNCTION public.pipeline_reinstate(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.state <> 'lapsed' THEN RAISE EXCEPTION 'pipeline: Pro is not lapsed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'coi' AND uploaded_at > coalesce(
       (SELECT max(created_at) FROM public.contractor_stage_events WHERE applicant_id = _id AND kind = 'lapse'), 'epoch'::timestamptz)) THEN
    RAISE EXCEPTION 'pipeline: upload the new certificate first';
  END IF;
  IF p.coi_effective_date IS NULL OR p.coi_expiry_date IS NULL OR p.coi_expiry_date <= current_date
     OR coalesce(p.coi_limit_occurrence, 0) < 1000000 OR coalesce(p.coi_limit_aggregate, 0) < 2000000
     OR p.coi_names_tidy_as_ai IS NOT TRUE THEN
    RAISE EXCEPTION 'pipeline: the new certificate is not verified (dates, $1M/$2M limits, Tidy as additional insured)';
  END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET state = 'open' WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'reinstate', p.stage, p.stage, 'lapsed', 'open', 'new COI verified');
END $$;

-- ---------------------------------------------------------- read models
CREATE OR REPLACE FUNCTION public.pipeline_board()
RETURNS TABLE(applicant_id uuid, name text, city text, service text, stage text, state text,
  days_in_stage integer, hold_callback_date date, hold_reason text, callback_overdue boolean,
  activated boolean, previously_declined text, overridden boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY
  SELECT p.applicant_id,
    trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')),
    coalesce(nullif(a.city_or_zip, ''), a.zip),
    p.service, p.stage, p.state,
    greatest(0, (current_date - p.stage_entered_at::date))::int,
    p.hold_callback_date, p.hold_reason,
    (p.state = 'hold' AND p.hold_callback_date <= current_date),
    p.activated_at IS NOT NULL,
    (SELECT 'Previously declined ' || to_char(coalesce(o.archived_at, o.updated_at), 'FMDD Mon') || ' — ' ||
            lower(coalesce(CASE WHEN o.decline_reason = 'Other' THEN o.decline_note END, o.decline_reason, 'withdrew'))
       FROM public.contractor_pipeline o JOIN public.applicants oa ON oa.id = o.applicant_id
      WHERE o.archived AND o.applicant_id <> p.applicant_id
        AND ((coalesce(a.email,'') <> '' AND lower(oa.email) = lower(a.email))
          OR (length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')) >= 10
              AND right(regexp_replace(coalesce(oa.phone,''), '\D', '', 'g'), 10) = right(regexp_replace(a.phone, '\D', '', 'g'), 10)))
      ORDER BY o.archived_at DESC NULLS LAST LIMIT 1),
    EXISTS (SELECT 1 FROM public.contractor_stage_events e WHERE e.applicant_id = p.applicant_id AND e.kind = 'override')
  FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
  WHERE NOT p.archived;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_archive_list(_q text DEFAULT NULL)
RETURNS TABLE(applicant_id uuid, name text, email text, phone text, service text, stage text, state text,
  reason text, archived_at timestamptz, spend_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := lower(trim(coalesce(_q, ''))); qd text := regexp_replace(coalesce(_q, ''), '\D', '', 'g');
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY
  SELECT p.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), a.email, a.phone,
    p.service, p.stage, p.state,
    CASE WHEN p.state = 'withdrawn' THEN 'Withdrew: ' || coalesce(p.withdrawn_note, '')
         ELSE coalesce(p.decline_reason, '') || coalesce(' — ' || p.decline_note, '') END,
    p.archived_at,
    coalesce((SELECT sum(s.amount_cents) FROM public.contractor_spend s WHERE s.applicant_id = p.applicant_id), 0)::bigint
  FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
  WHERE p.archived AND (q = ''
    OR lower(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')) LIKE '%' || q || '%'
    OR lower(coalesce(a.email, '')) LIKE '%' || q || '%'
    OR (length(qd) >= 3 AND regexp_replace(coalesce(a.phone, ''), '\D', '', 'g') LIKE '%' || qd || '%'))
  ORDER BY p.archived_at DESC NULLS LAST;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_money_at_risk()
RETURNS TABLE(service text, spend_cents bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY
  SELECT coalesce(p.service, 'unknown'), sum(s.amount_cents)::bigint
    FROM public.contractor_spend s JOIN public.contractor_pipeline p ON p.applicant_id = s.applicant_id
   WHERE NOT p.archived AND p.activated_at IS NULL
   GROUP BY 1;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_callbacks_due() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.contractor_pipeline
   WHERE state = 'hold' AND NOT archived AND hold_callback_date <= current_date
$$;

-- ------------------------------------------------- insurance is a live gate
CREATE OR REPLACE FUNCTION public.pipeline_pro_assignable(_applicant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contractor_pipeline p
     WHERE p.applicant_id = _applicant_id AND NOT p.archived AND p.state <> 'lapsed'
       AND p.coi_expiry_date IS NOT NULL AND p.coi_expiry_date > current_date)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_block_uninsured_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid; v_name text; v_col text := TG_ARGV[0];
BEGIN
  IF v_col = 'visit' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    SELECT id, first_name INTO v_app, v_name FROM public.applicants WHERE contractor_id = NEW.assigned_pro_id ORDER BY created_at DESC LIMIT 1;
  ELSIF v_col = 'subscription' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    v_app := NEW.assigned_pro_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  ELSE -- route assignment
    IF NOT coalesce(NEW.active, false) OR NEW.applicant_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.applicant_id IS NOT DISTINCT FROM OLD.applicant_id AND coalesce(OLD.active, false) THEN RETURN NEW; END IF;
    v_app := NEW.applicant_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  END IF;

  IF v_app IS NOT NULL AND public.pipeline_pro_assignable(v_app) THEN RETURN NEW; END IF;

  IF public.is_service_caller() THEN
    -- Automation: never crash the job; leave it unassigned and say so.
    INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
    VALUES ('insurance_action', 'action', 'insurance',
      'Assignment blocked — ' || coalesce(v_name, 'Pro') || ' has no valid insurance',
      'A job was left unassigned because this Pro''s certificate is lapsed or missing.',
      'Open pipeline', '/admin/pipeline', 'assign_block:' || coalesce(v_app::text, 'unknown') || ':' || current_date,
      jsonb_build_object('applicant_id', v_app))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF v_col = 'route' THEN NEW.active := false; ELSE NEW.assigned_pro_id := NULL; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Cannot assign %: insurance certificate is lapsed or missing', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
END $$;
CREATE TRIGGER trg_visits_insured_pro BEFORE INSERT OR UPDATE OF assigned_pro_id ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_block_uninsured_assignment('visit');
CREATE TRIGGER trg_subscriptions_insured_pro BEFORE INSERT OR UPDATE OF assigned_pro_id ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_block_uninsured_assignment('subscription');
CREATE TRIGGER trg_routes_insured_pro BEFORE INSERT OR UPDATE OF applicant_id, active ON public.pro_service_assignments
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_block_uninsured_assignment('route');

-- Nightly: 30/14/7-day warnings, lapse on the expiry day.
CREATE OR REPLACE FUNCTION public.pipeline_coi_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d integer; warned integer := 0; lapsed integer := 0;
BEGIN
  PERFORM public.pipeline_assert_admin();
  FOR r IN SELECT p.*, a.first_name, a.last_name, a.contractor_id FROM public.contractor_pipeline p
            JOIN public.applicants a ON a.id = p.applicant_id
           WHERE p.stage = 'active' AND p.activated_at IS NOT NULL AND p.state = 'open' AND NOT p.archived
  LOOP
    IF r.coi_expiry_date IS NULL OR r.coi_expiry_date <= current_date THEN
      PERFORM set_config('tidy.pipeline_move', 'on', true);
      UPDATE public.contractor_pipeline SET state = 'lapsed' WHERE applicant_id = r.applicant_id;
      INSERT INTO public.contractor_stage_events(applicant_id, kind, from_stage, to_stage, from_state, to_state, reason)
        VALUES (r.applicant_id, 'lapse', 'active', 'active', 'open', 'lapsed', 'certificate of insurance expired');
      IF r.contractor_id IS NOT NULL THEN
        UPDATE public.visits SET assigned_pro_id = NULL
         WHERE assigned_pro_id = r.contractor_id AND completed_at IS NULL
           AND (scheduled_start IS NULL OR scheduled_start >= now());
      END IF;
      UPDATE public.pro_service_assignments SET active = false WHERE applicant_id = r.applicant_id AND active;
      INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
      VALUES ('insurance_critical', 'critical', 'insurance',
        'Insurance lapsed — ' || trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')) || ' removed from routes',
        'Certificate expired ' || coalesce(to_char(r.coi_expiry_date, 'FMMon FMDD'), '(no date on file)') || '. Upcoming jobs were unassigned. Upload a new certificate to reinstate.',
        'Open record', '/admin/pipeline/' || r.applicant_id, 'coi_lapse:' || r.applicant_id || ':' || coalesce(r.coi_expiry_date::text, 'none'),
        jsonb_build_object('applicant_id', r.applicant_id))
      ON CONFLICT (dedupe_key) DO NOTHING;
      lapsed := lapsed + 1;
    ELSE
      d := r.coi_expiry_date - current_date;
      IF d IN (30, 14, 7) THEN
        INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
        VALUES (CASE WHEN d = 7 THEN 'insurance_critical' ELSE 'insurance_warning' END,
          CASE WHEN d = 7 THEN 'critical' ELSE 'warning' END, 'insurance',
          trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')) || '''s insurance expires in ' || d || ' days',
          'Certificate expires ' || to_char(r.coi_expiry_date, 'FMMon FMDD') || '. On that day they leave active and come off every route.',
          'Open record', '/admin/pipeline/' || r.applicant_id, 'coi_expiry_' || d || ':' || r.applicant_id || ':' || r.coi_expiry_date,
          jsonb_build_object('applicant_id', r.applicant_id, 'days', d))
        ON CONFLICT (dedupe_key) DO NOTHING;
        warned := warned + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('warned', warned, 'lapsed', lapsed);
END $$;

-- New applicants enter the pipeline at stage 1.
CREATE OR REPLACE FUNCTION public.pipeline_on_applicant_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.contractor_pipeline(applicant_id, service, source, apply_submitted_at)
  VALUES (NEW.id, public.pipeline_service_key(NEW.service),
    CASE WHEN lower(coalesce(NEW.source,'')) IN ('indeed','hanger','referral','other') THEN lower(NEW.source) END,
    CASE WHEN NEW.source = 'apply_form' THEN coalesce(NEW.created_at, now()) END)
  ON CONFLICT (applicant_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pipeline_on_applicant_insert AFTER INSERT ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_on_applicant_insert();

-- ---------------------------------------------------- migrate existing records
DO $mig$
DECLARE r record; st text; arch boolean;
BEGIN
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  FOR r IN SELECT * FROM public.applicants LOOP
    arch := r.current_stage = 'rejected';
    st := CASE
      WHEN r.current_stage = 'applied' THEN 'applied'
      WHEN r.current_stage IN ('screening','interview','interview_scheduled','interview_booked') THEN 'screened'
      WHEN r.current_stage IN ('offer','contracts_sent','contract_sent','contracts_done','contract_signed','bg_check',
                               'background_check_pending','background_check_review') THEN 'agreement'
      WHEN r.current_stage IN ('kit','oriented') THEN 'insured'
      WHEN r.current_stage = 'active' THEN 'active'
      WHEN arch THEN CASE
        WHEN r.sequence_stage IN ('contract_sent','signed','photo_approved','kit_ordered') THEN 'agreement'
        WHEN r.sequence_stage IN ('screening','interview_booked','waiting') THEN 'screened'
        WHEN r.sequence_stage IN ('all_set','active') THEN 'active'
        ELSE 'applied' END
      ELSE 'applied' END;
    INSERT INTO public.contractor_pipeline(applicant_id, stage, state, archived, archived_at, service, source,
      apply_submitted_at, coi_effective_date, coi_expiry_date, decline_reason, decline_note, stage_entered_at)
    VALUES (r.id, st, CASE WHEN arch THEN 'declined' ELSE 'open' END, arch, CASE WHEN arch THEN coalesce(r.rejected_at, r.updated_at) END,
      public.pipeline_service_key(r.service),
      CASE WHEN lower(coalesce(r.source,'')) IN ('indeed','hanger','referral','other') THEN lower(r.source) END,
      CASE WHEN r.source = 'apply_form' THEN r.created_at END,
      r.coi_effective_date, r.coi_expires_at,
      CASE WHEN arch THEN 'Other' END,
      CASE WHEN arch THEN coalesce(nullif(r.rejection_reason, ''), 'Declined before the new pipeline; no reason was recorded') END,
      coalesce(r.stage_entered_at, r.created_at))
    ON CONFLICT (applicant_id) DO NOTHING;
    INSERT INTO public.contractor_stage_events(applicant_id, kind, to_stage, to_state, reason, metadata)
    VALUES (r.id, 'migrate', st, CASE WHEN arch THEN 'declined' ELSE 'open' END, 'mapped from old status ' || coalesce(r.current_stage, 'none'),
      jsonb_build_object('old_status', r.current_stage, 'old_sequence_stage', r.sequence_stage,
        'checkr_report_id', r.checkr_report_id, 'checkr_report_status', r.checkr_report_status,
        'bg_check_status', r.bg_check_status, 'prev_state', 'open'));
  END LOOP;
END $mig$;

-- Lock the pipeline functions to admins/service.
REVOKE ALL ON FUNCTION public.pipeline_advance(uuid, text, boolean, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_update(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_add_artifact(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_mark_welcome_sent(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_hold(uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_resume(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_decline(uuid, text, text, date, boolean, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_withdraw(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_restore(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_bulk_decline(uuid[], text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_override(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_reinstate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_board() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_archive_list(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_money_at_risk() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_missing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_coi_tick() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_spend_lock_holder(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_pro_assignable(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_callbacks_due() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_archive_apply(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_log(uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_advance(uuid, text, boolean, integer, text), public.pipeline_update(uuid, jsonb),
  public.pipeline_add_artifact(uuid, text, text, text), public.pipeline_hold(uuid, text, date), public.pipeline_resume(uuid),
  public.pipeline_decline(uuid, text, text, date, boolean, date), public.pipeline_withdraw(uuid, text), public.pipeline_restore(uuid),
  public.pipeline_bulk_decline(uuid[], text, text), public.pipeline_override(uuid, text, text), public.pipeline_reinstate(uuid),
  public.pipeline_board(), public.pipeline_archive_list(text), public.pipeline_money_at_risk(), public.pipeline_missing(uuid)
  TO authenticated;

-- Private storage for pipeline files (admin only).
CREATE POLICY "pipeline artifacts admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pipeline-artifacts' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "pipeline artifacts admin insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'pipeline-artifacts' AND public.has_role(auth.uid(), 'admin'::public.app_role));

SELECT cron.schedule('pipeline-coi-tick', '30 11 * * *', $job$SELECT public.pipeline_coi_tick();$job$);
