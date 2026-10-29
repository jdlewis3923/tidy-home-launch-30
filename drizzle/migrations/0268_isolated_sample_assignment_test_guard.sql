DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.pipeline_block_uninsured_assignment()'::regprocedure) INTO definition;
 definition:=replace(definition,'IF v_col = ''visit'' THEN','IF v_col = ''visit'' AND coalesce(NEW.is_sample,false) AND public.is_service_caller() AND EXISTS(SELECT 1 FROM public.applicants a JOIN public.contractor_pipeline p ON p.applicant_id=a.id WHERE a.contractor_id=NEW.assigned_pro_id AND a.is_test_row AND p.is_test) THEN RETURN NEW; END IF; IF v_col = ''visit'' THEN');
 EXECUTE definition;
END $$;