ALTER TABLE public.contractor_pipeline ALTER COLUMN application_version SET DEFAULT 6;
DO $$ BEGIN
  PERFORM set_config('tidy.pipeline_move','on',true);
  UPDATE public.contractor_pipeline p SET application_version = 6
   WHERE p.application_version = 5 AND p.apply_submitted_at IS NULL
     AND coalesce(array_length(p.apply_question_ids,1),0) = 0
     AND coalesce(p.is_test,false) = false
     AND NOT EXISTS (SELECT 1 FROM public.application_answers x WHERE x.candidate_id = p.applicant_id);
END $$;