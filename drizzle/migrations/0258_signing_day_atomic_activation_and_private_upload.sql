CREATE OR REPLACE FUNCTION public.signing_day_activate_ready(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state jsonb; BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM 1 FROM public.applicants WHERE id=_id FOR UPDATE;
 state:=public.signing_day_state(_id);
 IF NOT coalesce((state->>'ready')::boolean,false) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.applicants WHERE id=_id AND signing_day_active_at IS NOT NULL) THEN RETURN true; END IF;
 PERFORM set_config('tidy.pipeline_move','on',true);
 UPDATE public.contractor_pipeline SET stage='active',activated_at=now(),probation_visits_remaining=coalesce(probation_visits_remaining,3),coi_effective_date=(SELECT coi_effective_date FROM public.applicants WHERE id=_id),coi_expiry_date=(SELECT coi_expires_at FROM public.applicants WHERE id=_id) WHERE applicant_id=_id AND NOT archived AND state='open';
 UPDATE public.applicants SET signing_day_active_at=now(),current_stage='active',sequence_stage='active' WHERE id=_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.signing_day_activate_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signing_day_activate_ready(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.signing_day_upload_certificate(_path text,_carrier text,_policy text,_effective date,_expires date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE aid uuid; BEGIN
 SELECT id INTO aid FROM public.applicants WHERE contractor_id=auth.uid() LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'not_pro'; END IF;
 IF _path NOT LIKE auth.uid()::text||'/coi-%' OR length(_path)>500 OR nullif(trim(_carrier),'') IS NULL OR length(_carrier)>200 OR nullif(trim(_policy),'') IS NULL OR length(_policy)>200 OR _effective IS NULL OR _expires IS NULL OR _expires<=_effective OR _expires<=current_date THEN RAISE EXCEPTION 'invalid_certificate'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='contractor-coi-pdfs' AND name=_path AND owner_id=auth.uid()::text) THEN RAISE EXCEPTION 'uploaded_file_required'; END IF;
 UPDATE public.applicants SET coi_pdf_url=_path,coi_uploaded_at=now(),coi_carrier_name=trim(_carrier),coi_policy_number=trim(_policy),coi_effective_date=_effective,coi_expires_at=_expires,coi_review_status='pending_review',gate_confirmations=coalesce(gate_confirmations,'{}')||jsonb_build_object('coi_limits_ok',false) WHERE id=aid;
END $$;
REVOKE ALL ON FUNCTION public.signing_day_upload_certificate(text,text,text,date,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signing_day_upload_certificate(text,text,text,date,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.signing_day_visit_access_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.uid()::text,'')<>'' AND NOT public.has_role(auth.uid(),'admin') AND EXISTS(SELECT 1 FROM public.applicants WHERE contractor_id=auth.uid() AND signing_day_signed_at IS NOT NULL AND signing_day_active_at IS NULL) THEN RAISE EXCEPTION 'Complete Getting Started before working visits.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER signing_day_visit_actions BEFORE UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.signing_day_visit_access_guard();