CREATE OR REPLACE FUNCTION public.trg_pro_all_set_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app uuid;
BEGIN
  app := CASE WHEN TG_TABLE_NAME = 'applicants' THEN (to_jsonb(NEW)->>'id')::uuid
              ELSE (to_jsonb(NEW)->>'applicant_id')::uuid END;
  IF app IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.applicants WHERE id = app AND all_set_sent_at IS NULL)
     AND public.pro_all_five(app) THEN
    PERFORM public.call_edge_function('pro-all-set', jsonb_build_object('applicant_id', app));
  END IF;
  RETURN NEW;
END $$;