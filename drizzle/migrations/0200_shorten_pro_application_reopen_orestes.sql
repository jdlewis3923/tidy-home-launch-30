-- Shorter application: keep identity, must-haves, availability, experience, core skills, 2 scenarios, equipment, reference, consent.
UPDATE public.question_bank SET active = false, updated_at = now()
WHERE key IN ('about.comfort_en','about.comfort_es','about.source','qual.ready',
  'avail.income_goal','avail.other_job','avail.other_job_grid','work.unpaid',
  'scen.s3','scen.s4','scen.s5','scen.s6','ref.years',
  'intent.motivation','intent.why_tidy','intent.other_apps','intent.blockers','intent.one_year')
  OR key LIKE 'style.%' OR key LIKE 'attend.%'
  OR (key LIKE 'skill.%' AND core = false);
UPDATE public.question_bank SET section = 3, sort = 90, updated_at = now() WHERE key = 'intent.earliest_start';

-- Reopen Orestes's closed application for 24 hours so he can finish where he stopped.
DO $$ DECLARE _id uuid; BEGIN
  SELECT p.applicant_id INTO _id FROM public.contractor_pipeline p JOIN public.applicants a ON a.id = p.applicant_id
   WHERE a.first_name = 'Orestes' AND p.archive_reason = 'no_apply' AND p.apply_submitted_at IS NULL LIMIT 1;
  IF _id IS NULL THEN RETURN; END IF;
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline SET archived = false, archived_at = NULL, state = 'open', archive_reason = NULL,
    decline_reason = NULL, invite_deadline_at = now() + interval '24 hours' WHERE applicant_id = _id;
  PERFORM public.hiring_set_deadline(_id, 'apply', now() + interval '24 hours', now() + interval '12 hours');
END $$;