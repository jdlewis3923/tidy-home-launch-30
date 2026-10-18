-- hiring_fit_report F10: work.jobs may be stored as text (free-form grid answer) — only iterate arrays.
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
  submit_interval interval; proof_interval interval; book_interval interval; jobs_val jsonb;
BEGIN
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id = _id;
  SELECT * INTO a FROM public.applicants WHERE id = _id;
  IF p.applicant_id IS NULL THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

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
  -- F10: employment gap > 6 months (only when work history was stored as a job list).
  jobs_val := hiring_answer(_id, 'work.jobs');
  IF jobs_val IS NOT NULL AND jsonb_typeof(jobs_val) = 'array' THEN
    FOR gap_rec IN SELECT j->>'end' AS e, j->>'start' AS s FROM jsonb_array_elements(jobs_val) j
    LOOP
      IF prev_start IS NOT NULL AND gap_rec.e IS NOT NULL AND gap_rec.e <> 'current' AND gap_rec.e ~ '^\d{4}-\d{2}'
         AND (prev_start - gap_rec.e::date) > 183 THEN
        flags := flags || jsonb_build_object('id','F10','list','phone','question', format('What were you doing between %s and %s?', gap_rec.e, prev_start));
      END IF;
      IF gap_rec.s IS NOT NULL AND gap_rec.s ~ '^\d{4}-\d{2}' THEN prev_start := gap_rec.s::date; END IF;
    END LOOP;
  END IF;

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