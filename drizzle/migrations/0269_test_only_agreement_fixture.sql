CREATE OR REPLACE FUNCTION public.signing_day_test_agreement(_id uuid,_service text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') OR _service NOT IN ('cleaning','lawn') OR NOT EXISTS(SELECT 1 FROM public.applicants a JOIN public.contractor_pipeline p ON p.applicant_id=a.id WHERE a.id=_id AND a.is_test_row AND p.is_test) THEN RAISE EXCEPTION 'test_admin_only'; END IF;
 PERFORM set_config('tidy.pipeline_move','on',true);
 UPDATE public.contractor_pipeline SET service=_service,proof_approved_at=now(),state='open',archived=false WHERE applicant_id=_id;
 UPDATE public.applicants SET service=_service,equipment_approved=true,contracts_signed=false,contract_template_id=NULL,contract_token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','') WHERE id=_id;
 END $$;
REVOKE ALL ON FUNCTION public.signing_day_test_agreement(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.signing_day_test_agreement(uuid,text) TO authenticated;