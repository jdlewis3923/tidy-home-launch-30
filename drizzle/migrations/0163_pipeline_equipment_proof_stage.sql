-- Eight-stage contractor pipeline: new stage 3 "proof" (equipment seen before any document or dollar).

ALTER TABLE public.contractor_pipeline DROP CONSTRAINT IF EXISTS contractor_pipeline_stage_check;
ALTER TABLE public.contractor_pipeline ADD CONSTRAINT contractor_pipeline_stage_check
  CHECK (stage IN ('applied','screened','proof','agreement','ins_quote','background','insured','active'));

ALTER TABLE public.contractor_pipeline
  ADD COLUMN IF NOT EXISTS preferred_language text CHECK (preferred_language IN ('en','es')),
  ADD COLUMN IF NOT EXISTS experience_level text CHECK (experience_level IN ('none','informal','professional')),
  ADD COLUMN IF NOT EXISTS equipment_claimed uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS proof_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS proof_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_link_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_approved_by uuid,
  ADD COLUMN IF NOT EXISTS proof_moved_back boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ref_name text,
  ADD COLUMN IF NOT EXISTS ref_phone text,
  ADD COLUMN IF NOT EXISTS ref_relationship text,
  ADD COLUMN IF NOT EXISTS ref_status text NOT NULL DEFAULT 'pending' CHECK (ref_status IN ('pending','confirmed','not_confirmed')),
  ADD COLUMN IF NOT EXISTS ref_notes text,
  ADD COLUMN IF NOT EXISTS one_pager_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS agreement_docs_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_instructions_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS cleared_notice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_notice_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS probation_visits_remaining integer,
  ADD COLUMN IF NOT EXISTS probation_redo_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS probation_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS probation_cleared_at timestamptz;
COMMENT ON COLUMN public.contractor_pipeline.owns_equipment IS 'DEPRECATED: replaced by equipment_claimed checklist and the proof stage';

-- Editable equipment checklist per service.
CREATE TABLE public.pipeline_equipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (service IN ('cleaning','lawn','car_care')),
  sort integer NOT NULL DEFAULT 0,
  label_en text NOT NULL,
  label_es text NOT NULL,
  needs_video boolean NOT NULL DEFAULT false,
  is_vehicle boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pipeline_equipment_items TO authenticated;
GRANT ALL ON public.pipeline_equipment_items TO service_role;
ALTER TABLE public.pipeline_equipment_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment items admin all" ON public.pipeline_equipment_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- One row per proof slot (photo:<item>, video:<item>, vehicle, work:1..3).
CREATE TABLE public.pipeline_proof_items (
  applicant_id uuid NOT NULL REFERENCES public.contractor_pipeline(applicant_id) ON DELETE CASCADE,
  slot text NOT NULL,
  storage_path text NOT NULL,
  mime text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reject_reason text CHECK (reject_reason IN ('Card not in photo','Not the required item','Not running / couldn''t tell it works','Blurry','Other')),
  reject_note text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  PRIMARY KEY (applicant_id, slot)
);
GRANT SELECT ON public.pipeline_proof_items TO authenticated;
GRANT ALL ON public.pipeline_proof_items TO service_role;
ALTER TABLE public.pipeline_proof_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proof items admin read" ON public.pipeline_proof_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Probation visits (first three jobs of every newly active Pro).
CREATE TABLE public.pipeline_probation_visits (
  visit_id uuid PRIMARY KEY,
  applicant_id uuid NOT NULL REFERENCES public.contractor_pipeline(applicant_id) ON DELETE CASCADE,
  n integer NOT NULL CHECK (n BETWEEN 1 AND 3),
  completed_at timestamptz NOT NULL DEFAULT now(),
  redo_at timestamptz
);
GRANT SELECT ON public.pipeline_probation_visits TO authenticated;
GRANT ALL ON public.pipeline_probation_visits TO service_role;
ALTER TABLE public.pipeline_probation_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "probation admin read" ON public.pipeline_probation_visits FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.contractor_stage_events DROP CONSTRAINT IF EXISTS contractor_stage_events_kind_check;
ALTER TABLE public.contractor_stage_events ADD CONSTRAINT contractor_stage_events_kind_check
  CHECK (kind IN ('advance','activate','hold','resume','decline','withdraw','restore','override','lapse','reinstate','migrate','refused',
                  'proof_review','proof_link','reference','probation','message'));

-- ------------------------------------------------------------ stage helpers
CREATE OR REPLACE FUNCTION public.pipeline_stage_index(_s text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['applied','screened','proof','agreement','ins_quote','background','insured','active'], _s)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_stage_label(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s WHEN 'applied' THEN 'Applied' WHEN 'screened' THEN 'Screened' WHEN 'proof' THEN 'Equipment proof'
    WHEN 'agreement' THEN 'Agreement' WHEN 'ins_quote' THEN 'Insurance quote' WHEN 'background' THEN 'Background check'
    WHEN 'insured' THEN 'Insured' WHEN 'active' THEN 'Active' ELSE _s END
$$;

CREATE OR REPLACE FUNCTION public.pipeline_proof_message() RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'Equipment proof not approved. Tidy does not pay for a background check on equipment nobody has seen.'::text
$$;

-- Required proof slots for a service.
CREATE OR REPLACE FUNCTION public.pipeline_proof_slots(_service text)
RETURNS TABLE(slot text, kind text, item_id uuid, label_en text, label_es text, sort integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'photo:' || i.id, 'photo', i.id, i.label_en, i.label_es, i.sort * 10
    FROM public.pipeline_equipment_items i WHERE i.service = _service AND i.active AND NOT i.is_vehicle
  UNION ALL
  SELECT 'video:' || i.id, 'video', i.id, i.label_en, i.label_es, i.sort * 10 + 1
    FROM public.pipeline_equipment_items i WHERE i.service = _service AND i.active AND NOT i.is_vehicle AND i.needs_video
  UNION ALL
  SELECT 'vehicle', 'vehicle', (SELECT v.id FROM public.pipeline_equipment_items v WHERE v.service = _service AND v.active AND v.is_vehicle ORDER BY v.sort LIMIT 1),
    CASE WHEN _service = 'lawn' THEN 'Vehicle with equipment loaded or trailer hitched' ELSE 'Vehicle with equipment loaded' END,
    CASE WHEN _service = 'lawn' THEN 'Vehículo con el equipo cargado o el tráiler enganchado' ELSE 'Vehículo con el equipo cargado' END, 9000
$$;

-- What is still missing for proof approval (used by exit requirements and the review panel).
CREATE OR REPLACE FUNCTION public.pipeline_proof_missing(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; m text[] := '{}'; s record; st text; work_ok boolean;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  IF p.applicant_id IS NULL THEN RETURN ARRAY['no pipeline record']; END IF;
  IF p.proof_submitted_at IS NULL THEN m := array_append(m, 'Proof submitted by the candidate'::text); END IF;
  FOR s IN SELECT * FROM public.pipeline_proof_slots(p.service) ORDER BY sort LOOP
    SELECT status INTO st FROM public.pipeline_proof_items WHERE applicant_id = _id AND slot = s.slot;
    IF st IS DISTINCT FROM 'approved' THEN
      m := array_append(m, (CASE s.kind WHEN 'video' THEN 'Video approved: ' WHEN 'vehicle' THEN 'Vehicle photo approved' ELSE 'Photo approved: ' END
        || CASE WHEN s.kind = 'vehicle' THEN '' ELSE s.label_en END)::text);
    END IF;
  END LOOP;
  work_ok := p.ref_status = 'confirmed'
    OR (coalesce(p.experience_level, '') <> 'none'
        AND (SELECT count(*) FROM public.pipeline_proof_items WHERE applicant_id = _id AND slot LIKE 'work:%' AND status = 'approved') >= 3);
  IF NOT work_ok THEN
    m := array_append(m, (CASE WHEN p.experience_level = 'none' THEN 'Reference called — confirmed (no experience: reference required)'
      ELSE '3 work photos approved, or reference called — confirmed' END)::text);
  END IF;
  RETURN m;
END $$;

-- Stage, state, archive, activation, spend and proof approval change only inside pipeline functions.
-- Independent of that: no stage at or past background without approved proof.
CREATE OR REPLACE FUNCTION public.pipeline_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proof_approved_at IS NULL AND public.pipeline_stage_index(NEW.stage) >= public.pipeline_stage_index('background')
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage OR OLD.proof_approved_at IS NOT NULL) THEN
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;
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
     OR NEW.spend_confirmed_at IS DISTINCT FROM OLD.spend_confirmed_at
     OR NEW.proof_approved_at IS DISTINCT FROM OLD.proof_approved_at OR NEW.proof_approved_by IS DISTINCT FROM OLD.proof_approved_by THEN
    RAISE EXCEPTION 'pipeline: stage can only change through Advance, Hold, Decline, Withdraw or Override'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- No background-check money without approved proof, whoever writes it.
CREATE OR REPLACE FUNCTION public.pipeline_spend_proof_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.category = 'background_check' AND NOT EXISTS (
       SELECT 1 FROM public.contractor_pipeline WHERE applicant_id = NEW.applicant_id AND proof_approved_at IS NOT NULL) THEN
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_spend_proof_guard BEFORE INSERT OR UPDATE ON public.contractor_spend
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_spend_proof_guard();

-- --------------------------------------------------------- exit requirements
CREATE OR REPLACE FUNCTION public.pipeline_missing(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; a public.applicants; m text[] := '{}';
  has_art boolean; unticked text;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN ARRAY['no pipeline record']; END IF;

  IF p.stage = 'applied' THEN
    IF p.apply_submitted_at IS NULL THEN m := array_append(m, 'Application submitted through /apply'::text); END IF;
    IF p.service IS NULL THEN m := array_append(m, 'Service (cleaning, lawn or car care)'::text); END IF;
    IF coalesce(length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')), 0) < 10 THEN m := array_append(m, 'Phone'::text); END IF;
    IF coalesce(a.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN m := array_append(m, 'Email'::text); END IF;
    IF p.source IS NULL THEN m := array_append(m, 'Source (Indeed, hanger, referral or other)'::text); END IF;
  ELSIF p.stage = 'screened' THEN
    IF p.screening_call_completed_at IS NULL THEN m := array_append(m, 'Screening call completed'::text); END IF;
    IF length(trim(coalesce(p.call_notes, ''))) < 20 THEN m := array_append(m, 'Call notes (at least 20 characters)'::text); END IF;
    IF p.preferred_language IS NULL THEN m := array_append(m, 'Preferred language (English or Spanish)'::text); END IF;
    IF p.experience_level IS NULL THEN m := array_append(m, 'Experience level recorded'::text); END IF;
    SELECT string_agg(i.label_en, ', ' ORDER BY i.sort) INTO unticked FROM public.pipeline_equipment_items i
     WHERE i.service = p.service AND i.active AND NOT (i.id = ANY(p.equipment_claimed));
    IF unticked IS NOT NULL THEN m := array_append(m, ('Equipment they say they own — not ticked: ' || unticked)::text); END IF;
    IF p.drive_time_minutes IS NULL THEN m := array_append(m, 'Drive time recorded'::text);
    ELSIF p.drive_time_minutes > 30 THEN m := array_append(m, 'Drive time is over 30 minutes'::text); END IF;
    IF coalesce(p.screening_decision, '') <> 'advance' THEN m := array_append(m, 'Screening decision: Advance'::text); END IF;
  ELSIF p.stage = 'proof' THEN
    m := m || public.pipeline_proof_missing(_id);
    IF p.proof_approved_at IS NULL AND coalesce(array_length(m, 1), 0) = 0 THEN m := array_append(m, 'Proof approval recorded'::text); END IF;
  ELSIF p.stage = 'agreement' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'ica_signed') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Signed ICA uploaded'::text); END IF;
    IF p.ica_countersigned_at IS NULL THEN m := array_append(m, 'ICA countersigned'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'w9') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'W-9 uploaded'::text); END IF;
    IF p.welcome_t1_sent_at IS NULL THEN m := array_append(m, 'WELCOME-T1 sent'::text); END IF;
  ELSIF p.stage = 'ins_quote' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'insurance_quote') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Insurance quote uploaded'::text); END IF;
    IF length(trim(coalesce(p.quote_carrier, ''))) = 0 THEN m := array_append(m, 'Quote carrier'::text); END IF;
    IF coalesce(p.quote_limit_occurrence, 0) < 1000000 THEN m := array_append(m, 'Quote per-occurrence limit of at least $1,000,000'::text); END IF;
    IF coalesce(p.quote_limit_aggregate, 0) < 2000000 THEN m := array_append(m, 'Quote aggregate limit of at least $2,000,000'::text); END IF;
    IF p.quote_names_tidy_as_ai IS NOT TRUE THEN m := array_append(m, 'Quote names Tidy as additional insured'::text); END IF;
    IF p.proof_approved_at IS NULL THEN m := array_append(m, public.pipeline_proof_message()); END IF;
  ELSIF p.stage = 'background' THEN
    IF p.spend_confirmed_at IS NULL THEN m := array_append(m, 'Background check spend confirmed'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'checkr_report') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Checkr report uploaded'::text); END IF;
    IF p.checkr_result IS NULL THEN m := array_append(m, 'Checkr result recorded'::text);
    ELSIF p.checkr_result <> 'clear' THEN m := array_append(m, 'Checkr result must be clear to advance'::text); END IF;
  ELSIF p.stage = 'insured' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'coi') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Certificate of insurance uploaded'::text); END IF;
    IF p.coi_effective_date IS NULL THEN m := array_append(m, 'COI effective date'::text); END IF;
    IF p.coi_expiry_date IS NULL THEN m := array_append(m, 'COI expiry date'::text);
    ELSIF p.coi_expiry_date <= current_date THEN m := array_append(m, 'COI expiry date must be in the future'::text); END IF;
    IF coalesce(p.coi_limit_occurrence, 0) < 1000000 THEN m := array_append(m, 'COI per-occurrence limit of at least $1,000,000'::text); END IF;
    IF coalesce(p.coi_limit_aggregate, 0) < 2000000 THEN m := array_append(m, 'COI aggregate limit of at least $2,000,000'::text); END IF;
    IF p.coi_names_tidy_as_ai IS NOT TRUE THEN m := array_append(m, 'COI names Tidy as additional insured'::text); END IF;
    IF p.insurance_reimbursement_start_month IS NULL THEN m := array_append(m, 'Insurance reimbursement start month'::text); END IF;
  ELSIF p.stage = 'active' THEN
    IF p.kit_issued_at IS NULL THEN m := array_append(m, 'Kit issued'::text); END IF;
    IF coalesce(a.pro_number, '') !~ '^TIDY-\d{4}$' THEN m := array_append(m, 'Badge number assigned (TIDY-0000)'::text); END IF;
    IF NOT p.route_confirmed OR coalesce(array_length(p.service_days, 1), 0) = 0 THEN m := array_append(m, 'Route confirmed with service days'::text); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.contractor_spend WHERE applicant_id = _id AND category = 'kit') THEN m := array_append(m, 'Kit spend recorded'::text); END IF;
  END IF;
  RETURN m;
END $$;

-- Spend-gate slot holder (stage 6, 7, or 8 not yet active) — unchanged by name.
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
DECLARE p public.contractor_pipeline; nm text; nxt text; miss text[]; h record; amt integer; tok text;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline: candidate not found'; END IF;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) INTO nm FROM public.applicants WHERE id = _id;
  IF p.archived THEN RAISE EXCEPTION 'pipeline: % is archived — restore first', nm; END IF;
  IF p.state <> 'open' THEN RAISE EXCEPTION 'pipeline: % is on %; resume first', nm, p.state; END IF;

  nxt := CASE WHEN p.stage = 'active' THEN 'active'
    ELSE (ARRAY['applied','screened','proof','agreement','ins_quote','background','insured','active'])[public.pipeline_stage_index(p.stage) + 1] END;

  IF _expected_to IS NOT NULL AND _expected_to <> nxt THEN
    PERFORM public.pipeline_log(_id, 'refused', p.stage, _expected_to, p.state, p.state,
      'only the next stage is allowed', jsonb_build_object('allowed', nxt));
    RAISE EXCEPTION 'pipeline: % is at % — the only stage allowed next is %; % is rejected',
      nm, public.pipeline_stage_label(p.stage), public.pipeline_stage_label(nxt), public.pipeline_stage_label(_expected_to)
      USING ERRCODE = '23514';
  END IF;

  IF public.pipeline_stage_index(nxt) >= public.pipeline_stage_index('background') AND p.proof_approved_at IS NULL THEN
    PERFORM public.pipeline_log(_id, 'refused', p.stage, nxt, p.state, p.state, 'equipment proof not approved');
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;

  miss := public.pipeline_missing(_id);
  IF coalesce(array_length(miss, 1), 0) > 0 THEN
    RAISE EXCEPTION 'pipeline: still missing — %', array_to_string(miss, '; ') USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('tidy.pipeline_move', 'on', true);

  IF p.stage = 'active' THEN
    IF p.activated_at IS NOT NULL THEN RAISE EXCEPTION 'pipeline: % is already active', nm; END IF;
    UPDATE public.contractor_pipeline SET activated_at = now(),
      probation_visits_remaining = coalesce(probation_visits_remaining, 3) WHERE applicant_id = _id;
    UPDATE public.applicants SET current_stage = 'active' WHERE id = _id AND current_stage IS DISTINCT FROM 'active';
    PERFORM public.pipeline_log(_id, 'activate', 'active', 'active', 'open', 'open', NULL);
    RETURN jsonb_build_object('ok', true, 'stage', 'active', 'activated', true);
  END IF;

  IF nxt = 'background' THEN
    SELECT * INTO h FROM public.pipeline_spend_lock_holder(p.service, _id);
    IF h.applicant_id IS NOT NULL THEN
      PERFORM public.pipeline_log(_id, 'refused', p.stage, nxt, p.state, p.state, 'spend lock',
        jsonb_build_object('holder', h.applicant_id));
      RAISE EXCEPTION '% already has a candidate past stage 5 (%, stage %). Tidy hires one Pro per service; Pro #2 comes at 30 reservations. Override if this is deliberate.',
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

  IF nxt = 'proof' THEN
    tok := coalesce(p.proof_token, encode(extensions.gen_random_bytes(24), 'hex'));
    UPDATE public.contractor_pipeline SET proof_token = tok, proof_token_expires_at = now() + interval '14 days',
      proof_link_sent_at = now(), proof_reminder_sent_at = NULL WHERE applicant_id = _id;
  END IF;

  UPDATE public.contractor_pipeline SET stage = nxt, stage_entered_at = now() WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'advance', p.stage, nxt, 'open', 'open', NULL);

  -- The only automatic candidate messages tied to an Advance click (§5).
  IF p.stage = 'screened' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'proof_invite'));
  ELSIF p.stage = 'proof' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'agreement_docs'));
  ELSIF p.stage = 'insured' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'activation'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'stage', nxt);
END $$;

-- ------------------------------------------------------- field edits (no stage)
CREATE OR REPLACE FUNCTION public.pipeline_update(_id uuid, _patch jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
  allowed text[] := ARRAY['service','source','apply_submitted_at','screening_call_completed_at','call_notes',
    'preferred_language','experience_level','equipment_claimed','drive_time_minutes','screening_decision','ica_countersigned_at','quote_carrier',
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
    preferred_language = CASE WHEN _patch ? 'preferred_language' THEN _patch->>'preferred_language' ELSE preferred_language END,
    experience_level = CASE WHEN _patch ? 'experience_level' THEN _patch->>'experience_level' ELSE experience_level END,
    equipment_claimed = CASE WHEN _patch ? 'equipment_claimed' THEN coalesce(ARRAY(SELECT (jsonb_array_elements_text(_patch->'equipment_claimed'))::uuid), '{}') ELSE equipment_claimed END,
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
  IF _patch ? 'phone' OR _patch ? 'email' OR _patch ? 'preferred_language' THEN
    UPDATE public.applicants SET
      phone = CASE WHEN _patch ? 'phone' THEN _patch->>'phone' ELSE phone END,
      email = CASE WHEN _patch ? 'email' THEN lower(_patch->>'email') ELSE email END,
      preferred_language = CASE WHEN _patch ? 'preferred_language' THEN _patch->>'preferred_language' ELSE preferred_language END
    WHERE id = _id;
  END IF;
END $$;

-- "On clear": the cleared message goes out when checkr_result = clear is saved.
CREATE OR REPLACE FUNCTION public.pipeline_checkr_clear_notice() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.checkr_result = 'clear' AND OLD.checkr_result IS DISTINCT FROM 'clear' AND NEW.cleared_notice_sent_at IS NULL
     AND NEW.stage = 'background' AND NEW.proof_approved_at IS NOT NULL THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', NEW.applicant_id, 'event', 'cleared'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pipeline_checkr_clear_notice AFTER UPDATE OF checkr_result ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_checkr_clear_notice();

-- Message stamps (service only).
CREATE OR REPLACE FUNCTION public.pipeline_mark_sent(_id uuid, _what text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  UPDATE public.contractor_pipeline SET
    one_pager_sent_at = CASE WHEN _what = 'proof_invite' THEN now() ELSE one_pager_sent_at END,
    proof_link_sent_at = CASE WHEN _what IN ('proof_invite','proof_link') THEN now() ELSE proof_link_sent_at END,
    proof_reminder_sent_at = CASE WHEN _what = 'proof_reminder' THEN coalesce(proof_reminder_sent_at, now()) ELSE proof_reminder_sent_at END,
    agreement_docs_sent_at = CASE WHEN _what = 'agreement_docs' THEN now() ELSE agreement_docs_sent_at END,
    insurance_instructions_sent_at = CASE WHEN _what = 'insurance_instructions' THEN now() ELSE insurance_instructions_sent_at END,
    cleared_notice_sent_at = CASE WHEN _what = 'cleared' THEN now() ELSE cleared_notice_sent_at END,
    activation_notice_sent_at = CASE WHEN _what = 'activation' THEN now() ELSE activation_notice_sent_at END
  WHERE applicant_id = _id;
END $$;

-- ---------------------------------------------------------------- override
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
  -- The one gate an override cannot bypass.
  IF public.pipeline_stage_index(_to_stage) >= public.pipeline_stage_index('background') AND p.proof_approved_at IS NULL THEN
    PERFORM public.pipeline_log(_id, 'refused', p.stage, _to_stage, p.state, p.state, 'override refused: equipment proof not approved',
      jsonb_build_object('override_reason', trim(_reason)));
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET stage = _to_stage, stage_entered_at = now(),
    activated_at = CASE WHEN _to_stage = 'active' THEN activated_at ELSE NULL END
   WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'override', p.stage, _to_stage, p.state, p.state, trim(_reason));
END $$;

-- FCRA guard renumbered: background is now stage 6.
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

  needs_fcra := public.pipeline_stage_index(p.stage) >= public.pipeline_stage_index('background') AND _reason = 'Background check'
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

-- ------------------------------------------------------------- proof review
CREATE OR REPLACE FUNCTION public.pipeline_proof_recompute(_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  ok := coalesce(array_length(public.pipeline_proof_missing(_id), 1), 0) = 0;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  IF ok THEN
    UPDATE public.contractor_pipeline SET proof_approved_at = coalesce(proof_approved_at, now()),
      proof_approved_by = coalesce(proof_approved_by, auth.uid()), proof_moved_back = false
     WHERE applicant_id = _id AND proof_approved_at IS NULL;
  ELSE
    UPDATE public.contractor_pipeline SET proof_approved_at = NULL, proof_approved_by = NULL
     WHERE applicant_id = _id AND proof_approved_at IS NOT NULL
       AND public.pipeline_stage_index(stage) < public.pipeline_stage_index('background');
  END IF;
  RETURN ok;
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_proof_review(_id uuid, _slot text, _approve boolean, _reason text DEFAULT NULL, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.pipeline_proof_items; ok boolean;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO it FROM public.pipeline_proof_items WHERE applicant_id = _id AND slot = _slot FOR UPDATE;
  IF it.slot IS NULL THEN RAISE EXCEPTION 'pipeline: nothing uploaded for that item yet'; END IF;
  IF NOT _approve THEN
    IF _reason IS NULL OR _reason NOT IN ('Card not in photo','Not the required item','Not running / couldn''t tell it works','Blurry','Other') THEN
      RAISE EXCEPTION 'pipeline: pick a reject reason';
    END IF;
    IF _reason = 'Other' AND length(trim(coalesce(_note, ''))) = 0 THEN RAISE EXCEPTION 'pipeline: "Other" needs a written reason'; END IF;
  END IF;
  UPDATE public.pipeline_proof_items SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
    reject_reason = CASE WHEN _approve THEN NULL ELSE _reason END,
    reject_note = CASE WHEN _approve THEN NULL ELSE nullif(trim(coalesce(_note, '')), '') END,
    reviewed_at = now(), reviewed_by = auth.uid()
   WHERE applicant_id = _id AND slot = _slot;
  PERFORM public.pipeline_log(_id, 'proof_review', NULL, NULL, NULL, NULL,
    CASE WHEN _approve THEN 'approved ' ELSE 'rejected ' END || _slot || coalesce(': ' || _reason, ''), jsonb_build_object('slot', _slot));
  ok := public.pipeline_proof_recompute(_id);
  IF NOT _approve THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'proof_rejected', 'slot', _slot));
  END IF;
  RETURN jsonb_build_object('ok', true, 'proof_approved', ok);
END $$;

CREATE OR REPLACE FUNCTION public.pipeline_reference_review(_id uuid, _status text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  PERFORM public.pipeline_assert_admin();
  IF _status NOT IN ('pending','confirmed','not_confirmed') THEN RAISE EXCEPTION 'pipeline: unknown reference status'; END IF;
  IF _status <> 'pending' AND NOT EXISTS (SELECT 1 FROM public.contractor_pipeline WHERE applicant_id = _id AND ref_name IS NOT NULL) THEN
    RAISE EXCEPTION 'pipeline: no reference was given';
  END IF;
  UPDATE public.contractor_pipeline SET ref_status = _status, ref_notes = nullif(trim(coalesce(_notes, '')), '') WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'reference', NULL, NULL, NULL, NULL, 'reference ' || _status, '{}'::jsonb);
  ok := public.pipeline_proof_recompute(_id);
  RETURN jsonb_build_object('ok', true, 'proof_approved', ok);
END $$;

-- "Send proof link" (migrated records and resends). Never automatic.
CREATE OR REPLACE FUNCTION public.pipeline_send_proof_link(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
  PERFORM public.pipeline_assert_admin();
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id FOR UPDATE;
  IF p.stage <> 'proof' OR p.archived OR p.state <> 'open' THEN RAISE EXCEPTION 'pipeline: only an open candidate at equipment proof can get the link'; END IF;
  IF p.preferred_language IS NULL THEN RAISE EXCEPTION 'pipeline: set the preferred language first'; END IF;
  UPDATE public.contractor_pipeline SET proof_token = coalesce(proof_token, encode(extensions.gen_random_bytes(24), 'hex')),
    proof_token_expires_at = now() + interval '14 days', proof_link_sent_at = now(), proof_reminder_sent_at = NULL
   WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'proof_link', 'proof', 'proof', p.state, p.state, 'proof link sent by admin');
  PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id,
    'event', CASE WHEN p.one_pager_sent_at IS NULL THEN 'proof_invite' ELSE 'proof_link' END));
END $$;

-- Hourly: the one 48-hour reminder (no auto-decline, no urgent alert).
CREATE OR REPLACE FUNCTION public.pipeline_proof_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n integer := 0; h integer := extract(hour FROM (now() AT TIME ZONE 'America/New_York'))::int;
BEGIN
  IF h < 9 OR h >= 19 THEN RETURN 0; END IF;
  FOR r IN SELECT applicant_id FROM public.contractor_pipeline
     WHERE stage = 'proof' AND state = 'open' AND NOT archived AND proof_submitted_at IS NULL
       AND proof_link_sent_at IS NOT NULL AND proof_link_sent_at <= now() - interval '48 hours'
       AND proof_reminder_sent_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.pipeline_proof_items i WHERE i.applicant_id = contractor_pipeline.applicant_id)
  LOOP
    UPDATE public.contractor_pipeline SET proof_reminder_sent_at = now() WHERE applicant_id = r.applicant_id;
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'proof_reminder'));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- 9 AM digest: proof overdue on day 5.
CREATE OR REPLACE FUNCTION public.pipeline_proof_overdue()
RETURNS TABLE(applicant_id uuid, name text, service text, sent_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY SELECT p.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')),
      public.pipeline_service_label(p.service), p.proof_link_sent_at
    FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
   WHERE p.stage = 'proof' AND p.state = 'open' AND NOT p.archived AND p.proof_approved_at IS NULL
     AND p.proof_link_sent_at IS NOT NULL AND p.proof_link_sent_at <= now() - interval '5 days'
   ORDER BY p.proof_link_sent_at;
END $$;

-- 9 PM digest: probation visits completed today.
CREATE OR REPLACE FUNCTION public.pipeline_probation_checks(_since timestamptz)
RETURNS TABLE(applicant_id uuid, name text, visit_id uuid, n integer, completed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  RETURN QUERY SELECT v.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), v.visit_id, v.n, v.completed_at
    FROM public.pipeline_probation_visits v JOIN public.applicants a ON a.id = v.applicant_id
   WHERE v.completed_at >= _since ORDER BY v.completed_at;
END $$;

-- Standing dashboard warnings (Spanish ICA / one-pagers missing).
CREATE OR REPLACE FUNCTION public.pipeline_doc_warnings() RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w text[] := '{}'; s text;
BEGIN
  PERFORM public.pipeline_assert_admin();
  IF NOT EXISTS (SELECT 1 FROM public.company_documents WHERE doc_key = 'ica:es' AND current_version AND archived_at IS NULL)
     AND EXISTS (SELECT 1 FROM public.contractor_pipeline WHERE preferred_language = 'es' AND NOT archived) THEN
    w := array_append(w, 'Spanish ICA not on file. Spanish-speaking candidates are signing the English version.'::text);
  END IF;
  FOREACH s IN ARRAY ARRAY['cleaning','lawn','car_care'] LOOP
    IF NOT EXISTS (SELECT 1 FROM public.company_documents WHERE doc_key = 'one_pager:' || s || ':es' AND current_version AND archived_at IS NULL) THEN
      w := array_append(w, ('Spanish one-pager missing for ' || CASE s WHEN 'cleaning' THEN 'House Cleaning Pro' WHEN 'lawn' THEN 'Lawn Care Pro' ELSE 'Car Care Pro' END)::text);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.company_documents WHERE doc_key = 'one_pager:' || s || ':en' AND current_version AND archived_at IS NULL) THEN
      w := array_append(w, ('English one-pager missing for ' || CASE s WHEN 'cleaning' THEN 'House Cleaning Pro' WHEN 'lawn' THEN 'Lawn Care Pro' ELSE 'Car Care Pro' END || ' — the proof step cannot send the role details')::text);
    END IF;
  END LOOP;
  RETURN w;
END $$;

-- ---------------------------------------------------------------- probation
CREATE OR REPLACE FUNCTION public.pipeline_probation_photo_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; need integer; nb integer; na integer; svc text;
BEGIN
  IF NEW.status::text <> 'complete' OR OLD.status::text = 'complete' OR NEW.assigned_pro_id IS NULL THEN RETURN NEW; END IF;
  SELECT cp.* INTO p FROM public.contractor_pipeline cp JOIN public.applicants a ON a.id = cp.applicant_id
   WHERE a.contractor_id = NEW.assigned_pro_id AND coalesce(cp.probation_visits_remaining, 0) > 0
   ORDER BY a.created_at DESC LIMIT 1;
  IF p.applicant_id IS NULL OR EXISTS (SELECT 1 FROM public.pipeline_probation_visits WHERE visit_id = NEW.id) THEN RETURN NEW; END IF;
  svc := lower(coalesce(NEW.service::text, NEW.service_type, ''));
  need := CASE WHEN svc = 'lawn' THEN 2 ELSE 3 END;
  SELECT count(*) FILTER (WHERE kind = 'before'), count(*) FILTER (WHERE kind = 'after') INTO nb, na
    FROM public.visit_photos WHERE visit_id = NEW.id;
  IF nb < need OR na < need THEN
    RAISE EXCEPTION 'Probation visit: add at least % before and % after photos to complete this job (you have % before, % after).', need, need, nb, na
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.pipeline_probation_visits(visit_id, applicant_id, n)
    VALUES (NEW.id, p.applicant_id, 4 - p.probation_visits_remaining);
  UPDATE public.contractor_pipeline SET probation_visits_remaining = probation_visits_remaining - 1 WHERE applicant_id = p.applicant_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_probation_photo_gate BEFORE UPDATE OF status ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_probation_photo_gate();

CREATE OR REPLACE FUNCTION public.pipeline_probation_redo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.pipeline_probation_visits; nm text; cnt integer;
BEGIN
  SELECT * INTO v FROM public.pipeline_probation_visits WHERE visit_id = NEW.visit_id;
  IF v.visit_id IS NULL OR v.redo_at IS NOT NULL OR coalesce(NEW.requested_at, NEW.created_at, now()) > v.completed_at + interval '48 hours' THEN RETURN NEW; END IF;
  UPDATE public.pipeline_probation_visits SET redo_at = now() WHERE visit_id = v.visit_id;
  UPDATE public.contractor_pipeline SET probation_redo_count = probation_redo_count + 1 WHERE applicant_id = v.applicant_id
    RETURNING probation_redo_count INTO cnt;
  SELECT trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) INTO nm FROM public.applicants WHERE id = v.applicant_id;
  INSERT INTO public.admin_alerts(alert_type, level, category, tier, title, body, action_label, action_url, dedupe_key, context)
  VALUES ('probation_redo', 'critical', 'hiring', 'urgent', nm || ' redo on probation visit ' || v.n || '.',
    'A customer asked for a redo within 48 hours of probation visit ' || v.n || ' of 3.', 'Open record', '/admin/pipeline/' || v.applicant_id,
    'probation_redo:' || v.visit_id, jsonb_build_object('applicant_id', v.applicant_id, 'visit_id', v.visit_id))
  ON CONFLICT (dedupe_key) DO NOTHING;
  IF cnt >= 2 THEN
    UPDATE public.contractor_pipeline SET probation_paused_at = coalesce(probation_paused_at, now()) WHERE applicant_id = v.applicant_id;
    INSERT INTO public.admin_alerts(alert_type, level, category, tier, title, body, action_label, action_url, dedupe_key, context)
    VALUES ('probation_paused', 'critical', 'hiring', 'urgent', nm || ': new assignments paused (2 probation redos).',
      'No new jobs can be assigned until you clear them on their record.', 'Open record', '/admin/pipeline/' || v.applicant_id,
      'probation_paused:' || v.applicant_id, jsonb_build_object('applicant_id', v.applicant_id))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_redo_probation AFTER INSERT ON public.redo_requests
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_probation_redo();

CREATE OR REPLACE FUNCTION public.pipeline_probation_clear(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.pipeline_assert_admin();
  UPDATE public.contractor_pipeline SET probation_paused_at = NULL, probation_cleared_at = now() WHERE applicant_id = _id AND probation_paused_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'pipeline: assignments are not paused'; END IF;
  UPDATE public.admin_alerts SET resolved_at = now() WHERE dedupe_key = 'probation_paused:' || _id AND resolved_at IS NULL;
  PERFORM public.pipeline_log(_id, 'probation', NULL, NULL, NULL, NULL, 'assignment pause cleared');
END $$;

-- Assignable = valid insurance AND not paused by probation redos.
CREATE OR REPLACE FUNCTION public.pipeline_pro_assignable(_applicant_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.contractor_pipeline p
     WHERE p.applicant_id = _applicant_id AND NOT p.archived AND p.state <> 'lapsed'
       AND p.coi_expiry_date IS NOT NULL AND p.coi_expiry_date > current_date
       AND p.probation_paused_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_block_uninsured_assignment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app uuid; v_name text; v_col text := TG_ARGV[0]; v_paused boolean;
BEGIN
  IF v_col = 'visit' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    SELECT id, first_name INTO v_app, v_name FROM public.applicants WHERE contractor_id = NEW.assigned_pro_id ORDER BY created_at DESC LIMIT 1;
  ELSIF v_col = 'subscription' THEN
    IF NEW.assigned_pro_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id) THEN RETURN NEW; END IF;
    v_app := NEW.assigned_pro_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  ELSE
    IF NOT coalesce(NEW.active, false) OR NEW.applicant_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.applicant_id IS NOT DISTINCT FROM OLD.applicant_id AND coalesce(OLD.active, false) THEN RETURN NEW; END IF;
    v_app := NEW.applicant_id;
    SELECT first_name INTO v_name FROM public.applicants WHERE id = v_app;
  END IF;

  IF v_app IS NOT NULL AND public.pipeline_pro_assignable(v_app) THEN RETURN NEW; END IF;
  SELECT probation_paused_at IS NOT NULL INTO v_paused FROM public.contractor_pipeline WHERE applicant_id = v_app;

  IF public.is_service_caller() THEN
    INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
    VALUES ('insurance_action', 'action', 'insurance',
      'Assignment blocked — ' || coalesce(v_name, 'Pro') || CASE WHEN v_paused THEN ' is paused after 2 probation redos' ELSE ' has no valid insurance' END,
      CASE WHEN v_paused THEN 'A job was left unassigned because this Pro''s new assignments are paused.' ELSE 'A job was left unassigned because this Pro''s certificate is lapsed or missing.' END,
      'Open pipeline', '/admin/pipeline', 'assign_block:' || coalesce(v_app::text, 'unknown') || ':' || current_date,
      jsonb_build_object('applicant_id', v_app))
    ON CONFLICT (dedupe_key) DO NOTHING;
    IF v_col = 'route' THEN NEW.active := false; ELSE NEW.assigned_pro_id := NULL; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(v_paused, false) THEN
    RAISE EXCEPTION 'Cannot assign %: new assignments are paused after 2 probation redos', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
  END IF;
  RAISE EXCEPTION 'Cannot assign %: insurance certificate is lapsed or missing', coalesce(v_name, 'this Pro') USING ERRCODE = '23514';
END $$;

-- Pro orientation unlocks renumbered (agreement 4, background 6, insured 7).
CREATE OR REPLACE FUNCTION public.pro_orientation_touch(_section_id text, _complete boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid uuid; st text; need integer; have integer;
BEGIN
 IF _section_id NOT IN ('before-you-work','what-it-pays','on-the-job','when-it-matters') THEN RAISE EXCEPTION 'unknown section'; END IF;
 SELECT a.id, coalesce(p.stage,'applied') INTO aid, st FROM public.applicants a LEFT JOIN public.contractor_pipeline p ON p.applicant_id=a.id WHERE a.contractor_id=auth.uid() LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'pro not found' USING ERRCODE='42501'; END IF;
 need := CASE _section_id WHEN 'before-you-work' THEN public.pipeline_stage_index('agreement') WHEN 'what-it-pays' THEN public.pipeline_stage_index('background')
   WHEN 'on-the-job' THEN public.pipeline_stage_index('background') ELSE public.pipeline_stage_index('insured') END;
 have := public.pipeline_stage_index(st);
 IF have < need THEN RAISE EXCEPTION 'section locked' USING ERRCODE='42501'; END IF;
 INSERT INTO public.pro_orientation_progress(applicant_id,section_id,completed_at) VALUES(aid,_section_id,CASE WHEN _complete THEN now() ELSE NULL END)
 ON CONFLICT(applicant_id,section_id) DO UPDATE SET completed_at=CASE WHEN _complete THEN coalesce(pro_orientation_progress.completed_at,now()) ELSE pro_orientation_progress.completed_at END;
END $$;

-- ------------------------------------------------- migrate existing records
DO $mig$
DECLARE r record;
BEGIN
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  FOR r IN SELECT * FROM public.contractor_pipeline
            WHERE stage IN ('agreement','ins_quote','background','insured','active') AND proof_approved_at IS NULL LOOP
    UPDATE public.contractor_pipeline SET stage = 'proof', stage_entered_at = now(), activated_at = NULL,
      proof_moved_back = public.pipeline_stage_index(r.stage) >= public.pipeline_stage_index('background')
     WHERE applicant_id = r.applicant_id;
    INSERT INTO public.contractor_stage_events(applicant_id, kind, from_stage, to_stage, from_state, to_state, reason, metadata)
    VALUES (r.applicant_id, 'migrate', r.stage, 'proof', r.state, r.state, 'Moved back for equipment proof (8-stage pipeline). Files and spend kept; no message sent.',
      jsonb_build_object('prev_state', r.state, 'prev_stage', r.stage));
  END LOOP;
END $mig$;

-- Permissions.
REVOKE ALL ON FUNCTION public.pipeline_proof_review(uuid, text, boolean, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_reference_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_send_proof_link(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_probation_clear(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_doc_warnings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_proof_missing(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_proof_slots(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pipeline_proof_overdue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_probation_checks(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_proof_tick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_proof_recompute(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pipeline_mark_sent(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_proof_review(uuid, text, boolean, text, text), public.pipeline_reference_review(uuid, text, text),
  public.pipeline_send_proof_link(uuid), public.pipeline_probation_clear(uuid), public.pipeline_doc_warnings(),
  public.pipeline_proof_missing(uuid), public.pipeline_proof_slots(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pipeline_proof_overdue(), public.pipeline_probation_checks(timestamptz), public.pipeline_mark_sent(uuid, text),
  public.pipeline_proof_tick() TO service_role;

CREATE POLICY "pipeline proof admin read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'pipeline-proof' AND public.has_role(auth.uid(), 'admin'::public.app_role));

SELECT cron.schedule('pipeline-proof-tick', '25 * * * *', $job$SELECT public.pipeline_proof_tick();$job$);