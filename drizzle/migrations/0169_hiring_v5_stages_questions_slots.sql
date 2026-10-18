-- Hiring system v5: 11-stage pipeline (invited → applied → proof → screen_booked →
-- phone_screened → referenced → interviewed → agreement → background → insured → active),
-- question bank, application answers, candidate FAQ, slots, scorecards, deadlines.
-- Replaces the v3/v4 stage order. Keeps proof gate, spend lock, override audit, probation.
-- Never touches archived or is_test records.

-- ============================================================ 1. stage list
ALTER TABLE public.contractor_pipeline DROP CONSTRAINT IF EXISTS contractor_pipeline_stage_check;

-- New columns first (the data migration below sets legacy_application).
ALTER TABLE public.contractor_pipeline
  ADD COLUMN IF NOT EXISTS legacy_application boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS apply_total_seconds integer,
  ADD COLUMN IF NOT EXISTS apply_resume_token text,
  ADD COLUMN IF NOT EXISTS phone_slot_id uuid,
  ADD COLUMN IF NOT EXISTS inperson_slot_id uuid,
  ADD COLUMN IF NOT EXISTS inperson_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sign_deadline_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_checkin_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkin_missed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revived_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS close_out_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_reschedules integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inperson_reschedules integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_deadline_at timestamptz;

-- Data migration BEFORE the new CHECK (skip archived + is_test).
-- screened → phone_screened; ins_quote → background when the spend was confirmed, else agreement.
UPDATE public.contractor_pipeline SET stage = 'phone_screened', legacy_application = true
 WHERE stage = 'screened' AND NOT archived AND NOT is_test;
UPDATE public.contractor_pipeline SET stage = CASE WHEN spend_confirmed_at IS NOT NULL THEN 'background' ELSE 'agreement' END
 WHERE stage = 'ins_quote' AND NOT archived AND NOT is_test;
-- Legacy short-form applications keep their stage but get the flag + "Send full application" path.
UPDATE public.contractor_pipeline SET legacy_application = true
 WHERE stage = 'applied' AND NOT archived AND NOT is_test AND apply_submitted_at IS NOT NULL;

ALTER TABLE public.contractor_pipeline ADD CONSTRAINT contractor_pipeline_stage_check
  CHECK (stage IN ('invited','applied','proof','screen_booked','phone_screened','referenced','interviewed','agreement','background','insured','active'));

CREATE OR REPLACE FUNCTION public.pipeline_stage_index(_s text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_position(ARRAY['invited','applied','proof','screen_booked','phone_screened','referenced','interviewed','agreement','background','insured','active'], _s)
$$;

CREATE OR REPLACE FUNCTION public.pipeline_stage_label(_s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s
    WHEN 'invited' THEN 'Invited' WHEN 'applied' THEN 'Applied' WHEN 'proof' THEN 'Equipment proof'
    WHEN 'screen_booked' THEN 'Phone screen booked' WHEN 'phone_screened' THEN 'Phone screened'
    WHEN 'referenced' THEN 'Referenced' WHEN 'interviewed' THEN 'Interviewed'
    WHEN 'agreement' THEN 'Agreement' WHEN 'background' THEN 'Background check'
    WHEN 'insured' THEN 'Insured' WHEN 'active' THEN 'Active' ELSE _s END
$$;

-- ============================================================ 2. launch_config day-pay column
-- est_full_day_pay: per-service full-day pay used by Fit Report flag F3 (editable in launch_config).
ALTER TABLE public.launch_config ADD COLUMN IF NOT EXISTS est_full_day_pay numeric;
UPDATE public.launch_config SET est_full_day_pay = 228 WHERE scope = 'cleaning' AND est_full_day_pay IS NULL;

-- ============================================================ 3. question bank
CREATE TABLE public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  service text NOT NULL DEFAULT 'all' CHECK (service IN ('all','cleaning','lawn','car_care')),
  section integer NOT NULL CHECK (section BETWEEN 1 AND 12),
  type text NOT NULL CHECK (type IN ('slider','number','yesno','choice','multi','text','grid','checklist','date')),
  label_en text NOT NULL,
  label_es text NOT NULL,
  anchors_key text CHECK (anchors_key IN ('skill','style')),
  core boolean NOT NULL DEFAULT false,
  demo_able boolean NOT NULL DEFAULT false,
  weight integer NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 0,
  options jsonb,
  correct_answer text,
  knockout boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.question_bank TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank TO authenticated;
GRANT ALL ON public.question_bank TO service_role;
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
CREATE POLICY "question bank public read" ON public.question_bank FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "question bank admin write" ON public.question_bank FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 4. answers
CREATE TABLE public.application_answers (
  candidate_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank(id) ON DELETE CASCADE,
  value jsonb NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, question_id)
);
GRANT SELECT, INSERT, UPDATE ON public.application_answers TO authenticated;
GRANT ALL ON public.application_answers TO service_role;
ALTER TABLE public.application_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answers admin read" ON public.application_answers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "answers admin write" ON public.application_answers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 5. candidate FAQ
CREATE TABLE public.candidate_faq (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  q_en text NOT NULL,
  a_en text NOT NULL DEFAULT '',
  q_es text NOT NULL,
  a_es text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  candidate_visible boolean NOT NULL DEFAULT true,
  needs_justin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.candidate_faq TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.candidate_faq TO authenticated;
GRANT ALL ON public.candidate_faq TO service_role;
ALTER TABLE public.candidate_faq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "faq public read" ON public.candidate_faq FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "faq admin write" ON public.candidate_faq FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 6. slots
CREATE TABLE public.hiring_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('phone','in_person')),
  starts_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  staff text,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','released','done','no_show')),
  booked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hiring_slots_open ON public.hiring_slots(kind, starts_at) WHERE status = 'open';
CREATE INDEX hiring_slots_applicant ON public.hiring_slots(applicant_id) WHERE applicant_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE ON public.hiring_slots TO authenticated;
GRANT ALL ON public.hiring_slots TO service_role;
ALTER TABLE public.hiring_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "slots admin all" ON public.hiring_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 7. scorecards
CREATE TABLE public.hiring_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('phone','reference','interview')),
  data jsonb NOT NULL DEFAULT '{}',
  passed boolean,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (applicant_id, kind)
);
GRANT SELECT, INSERT, UPDATE ON public.hiring_scorecards TO authenticated;
GRANT ALL ON public.hiring_scorecards TO service_role;
ALTER TABLE public.hiring_scorecards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scorecards admin all" ON public.hiring_scorecards FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 8. deadlines
CREATE TABLE public.hiring_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('apply','proof','book_phone','phone_slot','confirm_inperson','inperson_slot','sign','checkr_consent','coi','checkin')),
  due_at timestamptz NOT NULL,
  nudge_at timestamptz,
  nudged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hiring_deadlines_open ON public.hiring_deadlines(due_at) WHERE resolved_at IS NULL;
CREATE INDEX hiring_deadlines_applicant ON public.hiring_deadlines(applicant_id, kind);
GRANT SELECT, INSERT, UPDATE ON public.hiring_deadlines TO authenticated;
GRANT ALL ON public.hiring_deadlines TO service_role;
ALTER TABLE public.hiring_deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deadlines admin all" ON public.hiring_deadlines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 9. intent adjustments
CREATE TABLE public.intent_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  delta integer NOT NULL CHECK (delta BETWEEN -10 AND 10),
  reason text NOT NULL CHECK (length(trim(reason)) >= 5),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.intent_adjustments TO authenticated;
GRANT ALL ON public.intent_adjustments TO service_role;
ALTER TABLE public.intent_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intent adj admin all" ON public.intent_adjustments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- ============================================================ 10. guard: new candidates start at invited or applied
-- Keeps the is_test exemptions from 0164; v5 only widens the allowed insert stages.
CREATE OR REPLACE FUNCTION public.pipeline_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT NEW.is_test AND NEW.proof_approved_at IS NULL AND public.pipeline_stage_index(NEW.stage) >= public.pipeline_stage_index('background')
     AND (TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage OR OLD.proof_approved_at IS NOT NULL OR OLD.is_test) THEN
    RAISE EXCEPTION '%', public.pipeline_proof_message() USING ERRCODE = '23514';
  END IF;
  IF coalesce(current_setting('tidy.pipeline_move', true), '') = 'on' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage NOT IN ('invited','applied') OR NEW.state <> 'open' OR NEW.archived OR NEW.activated_at IS NOT NULL OR NEW.is_test THEN
      RAISE EXCEPTION 'pipeline: new candidates start at invited or applied' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.archived IS DISTINCT FROM OLD.archived OR NEW.activated_at IS DISTINCT FROM OLD.activated_at
     OR NEW.spend_confirmed_at IS DISTINCT FROM OLD.spend_confirmed_at OR NEW.is_test IS DISTINCT FROM OLD.is_test
     OR NEW.proof_approved_at IS DISTINCT FROM OLD.proof_approved_at OR NEW.proof_approved_by IS DISTINCT FROM OLD.proof_approved_by THEN
    RAISE EXCEPTION 'pipeline: stage can only change through Advance, Hold, Decline, Withdraw or Override'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ============================================================ 11. exit requirements (v5)
CREATE OR REPLACE FUNCTION public.pipeline_missing(_id uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.contractor_pipeline; a public.applicants; m text[] := '{}';
  has_art boolean; unticked text;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN ARRAY['no pipeline record']; END IF;

  IF p.stage = 'invited' THEN
    IF p.apply_submitted_at IS NULL THEN m := array_append(m, 'Full application submitted'::text); END IF;
  ELSIF p.stage = 'applied' THEN
    IF p.apply_submitted_at IS NULL THEN m := array_append(m, 'Full application submitted through /apply'::text); END IF;
    IF p.service IS NULL THEN m := array_append(m, 'Service (cleaning, lawn or car care)'::text); END IF;
    IF coalesce(length(regexp_replace(coalesce(a.phone,''), '\D', '', 'g')), 0) < 10 THEN m := array_append(m, 'Phone'::text); END IF;
    IF coalesce(a.email, '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN m := array_append(m, 'Email'::text); END IF;
    IF p.proof_submitted_at IS NULL THEN m := array_append(m, 'Equipment proof uploaded'::text); END IF;
  ELSIF p.stage = 'proof' THEN
    IF p.phone_slot_id IS NULL THEN m := array_append(m, 'Phone screen slot booked'::text); END IF;
  ELSIF p.stage = 'screen_booked' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hiring_scorecards s WHERE s.applicant_id = _id AND s.kind = 'phone' AND s.passed IS TRUE)
      THEN m := array_append(m, 'Phone Scorecard PASS'::text); END IF;
    IF p.inperson_slot_id IS NULL THEN m := array_append(m, 'In-person slot attached'::text); END IF;
    IF p.inperson_confirmed_at IS NULL THEN m := array_append(m, 'CONFIRM reply within 2 hours'::text); END IF;
  ELSIF p.stage = 'phone_screened' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hiring_scorecards s WHERE s.applicant_id = _id AND s.kind = 'reference' AND s.passed IS TRUE)
      THEN m := array_append(m, 'Reference PASS'::text); END IF;
  ELSIF p.stage = 'referenced' THEN
    IF NOT EXISTS (SELECT 1 FROM public.hiring_scorecards s WHERE s.applicant_id = _id AND s.kind = 'interview' AND s.passed IS TRUE)
      THEN m := array_append(m, 'In-Person Scorecard PASS'::text); END IF;
  ELSIF p.stage = 'interviewed' THEN
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'ica_signed') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'Signed ICA'::text); END IF;
    SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = 'w9') INTO has_art;
    IF NOT has_art THEN m := array_append(m, 'W-9'::text); END IF;
  ELSIF p.stage = 'agreement' THEN
    IF p.proof_approved_at IS NULL THEN m := array_append(m, public.pipeline_proof_message()); END IF;
    IF p.spend_confirmed_at IS NULL THEN m := array_append(m, 'Background check spend confirmed ($64.49)'::text); END IF;
  ELSIF p.stage = 'background' THEN
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

-- ============================================================ 12. advance (v5)
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
    ELSE (ARRAY['invited','applied','proof','screen_booked','phone_screened','referenced','interviewed','agreement','background','insured','active'])[public.pipeline_stage_index(p.stage) + 1] END;

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
      RAISE EXCEPTION '% already has a candidate past the agreement (%, stage %). Tidy hires one Pro per service; Pro #2 comes at 30 reservations. Override if this is deliberate.',
        public.pipeline_service_label(p.service), h.name, public.pipeline_stage_label(h.stage) USING ERRCODE = '23514';
    END IF;
    IF NOT _confirm_spend THEN RAISE EXCEPTION 'pipeline: spend confirmation required ($64.49)' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.contractor_spend(applicant_id, amount_cents, category, note, created_by)
      VALUES (_id, 6449, 'background_check', coalesce(_note, 'Checkr Essential + MVR'), auth.uid());
    UPDATE public.contractor_pipeline SET spend_confirmed_at = now() WHERE applicant_id = _id;
  ELSIF nxt = 'active' THEN
    amt := coalesce(_amount_cents, 6000);
    IF NOT _confirm_spend THEN RAISE EXCEPTION 'pipeline: kit spend confirmation required' USING ERRCODE = '23514'; END IF;
    IF amt <= 0 THEN RAISE EXCEPTION 'pipeline: kit amount must be above $0' USING ERRCODE = '23514'; END IF;
    INSERT INTO public.contractor_spend(applicant_id, amount_cents, category, note, created_by)
      VALUES (_id, amt, 'kit', coalesce(_note, 'Pro kit'), auth.uid());
  END IF;

  IF nxt = 'proof' THEN
    tok := coalesce(p.proof_token, encode(extensions.gen_random_bytes(24), 'hex'));
    UPDATE public.contractor_pipeline SET proof_token = tok, proof_token_expires_at = now() + interval '14 days',
      proof_link_sent_at = coalesce(proof_link_sent_at, now()), proof_reminder_sent_at = NULL WHERE applicant_id = _id;
  END IF;

  UPDATE public.contractor_pipeline SET stage = nxt, stage_entered_at = now() WHERE applicant_id = _id;
  PERFORM public.pipeline_log(_id, 'advance', p.stage, nxt, 'open', 'open', NULL);

  -- Automatic candidate messages welded to specific transitions.
  IF p.stage = 'applied' AND nxt = 'proof' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'proof_invite'));
  ELSIF p.stage = 'proof' AND nxt = 'screen_booked' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'book_phone'));
  ELSIF p.stage = 'interviewed' AND nxt = 'agreement' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'agreement_docs'));
  ELSIF p.stage = 'insured' AND nxt = 'active' THEN
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', _id, 'event', 'activation'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'stage', nxt);
END $$;

-- Spend-lock holder: agreement and later (not yet active) — v5 stages.
CREATE OR REPLACE FUNCTION public.pipeline_spend_lock_holder(_service text, _except uuid)
RETURNS TABLE(applicant_id uuid, name text, stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.applicant_id, trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')), p.stage
    FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
   WHERE p.service = _service AND p.applicant_id <> _except AND NOT p.archived AND NOT p.is_test
     AND (p.stage IN ('background','insured') OR (p.stage = 'active' AND p.activated_at IS NULL))
   ORDER BY p.stage_entered_at LIMIT 1
$$;

-- ============================================================ 13. answer helper + fit report
CREATE OR REPLACE FUNCTION public.hiring_answer(_id uuid, _key text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ans.value FROM public.application_answers ans
    JOIN public.question_bank q ON q.id = ans.question_id
   WHERE ans.candidate_id = _id AND q.key = _key LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hiring_answer_num(_id uuid, _key text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(ans.value) = 'number' THEN (ans.value)::text::numeric
              WHEN jsonb_typeof(ans.value) = 'string' AND ans.value::text ~ '^"-?[0-9.]+"$' THEN trim(both '"' from ans.value::text)::numeric
              ELSE NULL END
    FROM public.application_answers ans JOIN public.question_bank q ON q.id = ans.question_id
   WHERE ans.candidate_id = _id AND q.key = _key LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.hiring_answer_text(_id uuid, _key text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN jsonb_typeof(ans.value) = 'string' THEN trim(both '"' from ans.value::text) ELSE ans.value::text END
    FROM public.application_answers ans JOIN public.question_bank q ON q.id = ans.question_id
   WHERE ans.candidate_id = _id AND q.key = _key LIMIT 1
$$;

-- The Fit Report: gauges, flags F1–F10, split talking points. Computed live.
CREATE OR REPLACE FUNCTION public.hiring_fit_report(_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.contractor_pipeline; a public.applicants;
  skill_num numeric := 0; skill_den numeric := 0; skill_score int;
  rel int := 100; intent int := 0;
  late3 numeric; missed12 numeric; jobs24 numeric; late_resp text;
  s_wrong int := 0; motivation text; other_apps text; earliest text; why text;
  on_time numeric; reply numeric; paid_years text; income numeric; days_wanted text;
  flags jsonb := '[]'::jsonb; phone_tp jsonb := '[]'::jsonb; inperson_tp jsonb := '[]'::jsonb;
  bars jsonb := '[]'::jsonb; scenarios jsonb := '[]'::jsonb;
  r record; adj int; ready_by text; day_pay numeric; tens int; gap_rec record; prev_start date;
  submit_interval interval; proof_interval interval; book_interval interval;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  -- SKILL: weighted average of service sliders × 10 (core weight 2).
  FOR r IN SELECT q.key, q.label_en, q.core, q.demo_able, q.weight,
             hiring_answer_num(_id, q.key) AS v
             FROM public.question_bank q
            WHERE q.section = 5 AND q.type = 'slider' AND q.active
              AND (q.service = p.service OR q.service = 'all') ORDER BY q.sort
  LOOP
    IF r.v IS NOT NULL THEN
      skill_num := skill_num + r.v * (CASE WHEN r.core THEN 2 ELSE 1 END);
      skill_den := skill_den + (CASE WHEN r.core THEN 2 ELSE 1 END);
    END IF;
    bars := bars || jsonb_build_object('key', r.key, 'label', r.label_en, 'value', r.v, 'core', r.core, 'demo', r.demo_able);
  END LOOP;
  skill_score := CASE WHEN skill_den > 0 THEN round(skill_num / skill_den * 10)::int ELSE 0 END;

  -- RELIABILITY
  late3 := coalesce(hiring_answer_num(_id, 'attend.late_3m'), 0);
  missed12 := coalesce(hiring_answer_num(_id, 'attend.missed_12m'), 0);
  jobs24 := coalesce(hiring_answer_num(_id, 'attend.jobs_24m'), 0);
  late_resp := coalesce(hiring_answer_text(_id, 'attend.late_response'), '');
  rel := rel - least(40, late3::int * 10);
  rel := rel - least(30, greatest(0, missed12::int - 2) * 5);
  IF jobs24 >= 3 THEN rel := rel - 15; END IF;
  FOR r IN SELECT q.key, q.correct_answer, hiring_answer_text(_id, q.key) AS v
             FROM public.question_bank q WHERE q.section = 8 AND q.active ORDER BY q.sort
  LOOP
    scenarios := scenarios || jsonb_build_object('key', r.key, 'answer', r.v, 'correct', r.correct_answer, 'wrong', r.v IS NOT NULL AND r.v IS DISTINCT FROM r.correct_answer);
    IF r.v IS NOT NULL AND r.v IS DISTINCT FROM r.correct_answer AND r.key IN ('scen.s1','scen.s4','scen.s6') THEN
      s_wrong := s_wrong + 1;
    END IF;
  END LOOP;
  rel := rel - s_wrong * 10;
  IF late_resp IS NOT NULL AND late_resp <> '' AND late_resp <> 'call_before' THEN rel := rel - 10; END IF;
  rel := greatest(0, rel);

  -- INTENT (behaviour-based, recalculated live)
  IF p.invited_at IS NOT NULL AND p.apply_submitted_at IS NOT NULL THEN
    submit_interval := p.apply_submitted_at - p.invited_at;
    IF submit_interval < interval '12 hours' THEN intent := intent + 20;
    ELSIF submit_interval < interval '24 hours' THEN intent := intent + 12;
    ELSIF submit_interval < interval '48 hours' THEN intent := intent + 5; END IF;
  END IF;
  IF p.apply_submitted_at IS NOT NULL AND p.proof_submitted_at IS NOT NULL THEN
    proof_interval := p.proof_submitted_at - p.apply_submitted_at;
    IF proof_interval < interval '24 hours' THEN intent := intent + 15; END IF;
  END IF;
  IF p.proof_submitted_at IS NOT NULL AND p.phone_slot_id IS NOT NULL THEN
    SELECT s.booked_at - p.proof_submitted_at INTO book_interval FROM public.hiring_slots s WHERE s.id = p.phone_slot_id;
    IF book_interval IS NOT NULL AND book_interval < interval '24 hours' THEN intent := intent + 10; END IF;
  END IF;
  IF p.inperson_confirmed_at IS NOT NULL THEN intent := intent + 10; END IF;
  motivation := coalesce(hiring_answer_text(_id, 'intent.motivation'), '');
  IF motivation IN ('steady_route','build_business') THEN intent := intent + 15;
  ELSIF motivation IN ('flexible','extra_income') THEN intent := intent + 5; END IF;
  other_apps := coalesce(hiring_answer_text(_id, 'intent.other_apps'), '');
  IF other_apps = '0' THEN intent := intent + 10; ELSIF other_apps = '1-2' THEN intent := intent + 5; END IF;
  earliest := hiring_answer_text(_id, 'intent.earliest_start');
  ready_by := (SELECT pro_ready_by::text FROM public.launch_config
               WHERE scope = CASE WHEN p.service = 'car_care' THEN 'car' ELSE coalesce(p.service, 'cleaning') END);
  IF earliest IS NOT NULL AND earliest ~ '^\d{4}-\d{2}-\d{2}$' AND ready_by IS NOT NULL AND earliest::date <= ready_by::date THEN intent := intent + 10; END IF;
  why := coalesce(hiring_answer_text(_id, 'intent.why_tidy'), '');
  IF array_length(regexp_split_to_array(trim(why), '\s+'), 1) > 15 THEN intent := intent + 5; END IF;
  SELECT coalesce(sum(delta), 0)::int INTO adj FROM public.intent_adjustments WHERE applicant_id = _id;
  intent := least(100, greatest(0, intent + adj));

  -- FLAGS
  on_time := hiring_answer_num(_id, 'style.on_time');
  IF on_time IS NOT NULL AND on_time >= 8 AND (late3 >= 2 OR missed12 >= 5) THEN
    flags := flags || jsonb_build_object('id','F1','list','phone','question',
      format('You rated yourself %s/10 on being on time and told us you were late %s times in 3 months. Walk me through that.', on_time::int, late3::int));
  END IF;
  IF jobs24 >= 3 THEN
    flags := flags || jsonb_build_object('id','F2','list','phone','question','Tell me how each of your last three jobs ended.');
  END IF;
  income := hiring_answer_num(_id, 'avail.income_goal');
  days_wanted := coalesce(hiring_answer_text(_id, 'avail.days_per_week'), '');
  day_pay := (SELECT est_full_day_pay FROM public.launch_config
              WHERE scope = CASE WHEN p.service = 'car_care' THEN 'car' ELSE coalesce(p.service, 'cleaning') END);
  IF income IS NOT NULL AND day_pay IS NOT NULL AND days_wanted ~ '^\d+$'
     AND income > days_wanted::int * day_pay THEN
    flags := flags || jsonb_build_object('id','F3','list','phone','question',
      format('Your goal is $%s/week. A full %s day pays about $%s, and the route builds over the first weeks. How does that fit?', income::int, p.service, day_pay::int));
  END IF;
  FOR r IN SELECT q.label_en, hiring_answer_num(_id, q.key) AS v FROM public.question_bank q
             WHERE q.section = 5 AND q.core AND q.active AND (q.service = p.service OR q.service = 'all')
  LOOP
    IF r.v IS NOT NULL AND r.v <= 3 THEN
      flags := flags || jsonb_build_object('id','F4','list','in_person','question',
        format('You rated %s %s. How would you handle it on a visit tomorrow?', r.label_en, r.v::int));
    END IF;
  END LOOP;
  paid_years := coalesce(hiring_answer_text(_id, 'work.paid_years'), '');
  SELECT count(*)::int INTO tens FROM public.question_bank q
   WHERE q.section IN (5,6) AND q.type = 'slider' AND q.active AND (q.service = p.service OR q.service = 'all')
     AND hiring_answer_num(_id, q.key) = 10;
  IF tens >= 3 AND paid_years IN ('0','<1') THEN
    flags := flags || jsonb_build_object('id','F5','list','in_person','question','PROVE IN PERSON: several 10/10 self-ratings with under a year of paid experience.');
  END IF;
  FOR r IN SELECT q.key, q.label_en FROM public.question_bank q
             WHERE q.section = 8 AND q.active
               AND hiring_answer_text(_id, q.key) IS NOT NULL
               AND hiring_answer_text(_id, q.key) IS DISTINCT FROM q.correct_answer
  LOOP
    flags := flags || jsonb_build_object('id','F6','list','in_person','question', format('Re-ask scenario %s live — the written answer was wrong.', r.key));
  END LOOP;
  IF hiring_answer_text(_id, 'avail.other_job') = 'yes' THEN
    flags := flags || jsonb_build_object('id','F7','list','phone','question','How will you cover your days with your other job?');
  END IF;
  IF other_apps = '3+' OR (earliest IS NOT NULL AND earliest ~ '^\d{4}-\d{2}-\d{2}$' AND ready_by IS NOT NULL AND earliest::date > ready_by::date)
     OR (motivation = 'extra_income' AND days_wanted = '2') THEN
    flags := flags || jsonb_build_object('id','F8','list','phone','question','If another offer came this week, what would decide it?');
  END IF;
  reply := hiring_answer_num(_id, 'style.reply_texts');
  IF reply IS NOT NULL AND reply <= 5 THEN
    flags := flags || jsonb_build_object('id','F9','list','phone','question','If we text at 7 AM about a change, when would we hear back?');
  END IF;
  -- F10: employment gap > 6 months. Jobs are listed most-recent first; the gap is
  -- between the more recent job's start (prev_start) and the older job's end.
  FOR gap_rec IN SELECT j->>'end' AS e, j->>'start' AS s FROM jsonb_array_elements(coalesce(hiring_answer(_id, 'work.jobs'), '[]'::jsonb)) j
  LOOP
    IF prev_start IS NOT NULL AND gap_rec.e IS NOT NULL AND gap_rec.e <> 'current' AND gap_rec.e ~ '^\d{4}-\d{2}'
       AND (prev_start - gap_rec.e::date) > 183 THEN
      flags := flags || jsonb_build_object('id','F10','list','phone','question', format('What were you doing between %s and %s?', gap_rec.e, prev_start));
    END IF;
    IF gap_rec.s IS NOT NULL AND gap_rec.s ~ '^\d{4}-\d{2}' THEN prev_start := gap_rec.s::date; END IF;
  END LOOP;

  -- Split talking points
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO phone_tp FROM jsonb_array_elements(flags) f WHERE f->>'list' = 'phone';
  SELECT coalesce(jsonb_agg(f), '[]'::jsonb) INTO inperson_tp FROM jsonb_array_elements(flags) f WHERE f->>'list' = 'in_person';

  RETURN jsonb_build_object(
    'name', trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,'')),
    'service', p.service, 'language', p.preferred_language,
    'stage', p.stage, 'legacy_application', p.legacy_application,
    'skill', skill_score, 'reliability', rel, 'intent', intent,
    'skill_self_rated', true,
    'bars', bars, 'scenarios', scenarios,
    'attendance', jsonb_build_object('late_3m', late3, 'missed_12m', missed12, 'jobs_24m', jobs24, 'late_response', late_resp),
    'flags', flags, 'phone_talking_points', phone_tp, 'inperson_talking_points', inperson_tp,
    'intent_adjustments', adj
  );
END $$;

-- ============================================================ 14. deadline helper
CREATE OR REPLACE FUNCTION public.hiring_set_deadline(_id uuid, _kind text, _due timestamptz, _nudge timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hiring_deadlines SET resolved_at = now()
   WHERE applicant_id = _id AND kind = _kind AND resolved_at IS NULL;
  INSERT INTO public.hiring_deadlines(applicant_id, kind, due_at, nudge_at)
  VALUES (_id, _kind, _due, _nudge);
END $$;

CREATE OR REPLACE FUNCTION public.hiring_resolve_deadline(_id uuid, _kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.hiring_deadlines SET resolved_at = now()
   WHERE applicant_id = _id AND kind = _kind AND resolved_at IS NULL;
END $$;

-- ============================================================ 15. auto-advance on proof submit
-- When the candidate submits proof, move applied → proof and send the phone booking link.
-- Admin approval still gates background (guard above).
CREATE OR REPLACE FUNCTION public.pipeline_on_proof_submitted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.proof_submitted_at IS NOT NULL AND OLD.proof_submitted_at IS NULL
     AND NEW.stage = 'applied' AND NOT NEW.archived AND NOT NEW.is_test THEN
    PERFORM set_config('tidy.pipeline_move', 'on', true);
    UPDATE public.contractor_pipeline SET stage = 'proof', stage_entered_at = now() WHERE applicant_id = NEW.applicant_id;
    PERFORM public.pipeline_log(NEW.applicant_id, 'advance', 'applied', 'proof', 'open', 'open', 'proof uploaded — auto-advance');
    PERFORM public.hiring_resolve_deadline(NEW.applicant_id, 'proof');
    PERFORM public.hiring_set_deadline(NEW.applicant_id, 'book_phone', now() + interval '48 hours', now() + interval '24 hours');
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', NEW.applicant_id, 'event', 'book_phone'));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pipeline_proof_submitted ON public.contractor_pipeline;
CREATE TRIGGER trg_pipeline_proof_submitted AFTER UPDATE OF proof_submitted_at ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_on_proof_submitted();

-- ============================================================ 16. application submit sets deadline + intent clock
CREATE OR REPLACE FUNCTION public.pipeline_on_application_submitted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.apply_submitted_at IS NOT NULL AND OLD.apply_submitted_at IS NULL THEN
    PERFORM public.hiring_resolve_deadline(NEW.applicant_id, 'apply');
    IF NEW.stage = 'invited' AND NOT NEW.archived AND NOT NEW.is_test THEN
      PERFORM set_config('tidy.pipeline_move', 'on', true);
      UPDATE public.contractor_pipeline SET stage = 'applied', stage_entered_at = now() WHERE applicant_id = NEW.applicant_id;
      PERFORM public.pipeline_log(NEW.applicant_id, 'advance', 'invited', 'applied', 'open', 'open', 'application submitted — auto-advance');
    END IF;
    PERFORM public.hiring_set_deadline(NEW.applicant_id, 'proof', now() + interval '48 hours', now() + interval '24 hours');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pipeline_application_submitted ON public.contractor_pipeline;
CREATE TRIGGER trg_pipeline_application_submitted AFTER UPDATE OF apply_submitted_at ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_on_application_submitted();