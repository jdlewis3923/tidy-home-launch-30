CREATE OR REPLACE FUNCTION public.signing_day_activate_ready(_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE readiness jsonb; BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM 1 FROM public.applicants WHERE id=_id FOR UPDATE;
 readiness:=public.signing_day_state(_id);
 IF NOT coalesce((readiness->>'ready')::boolean,false) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM public.applicants WHERE id=_id AND signing_day_active_at IS NOT NULL) THEN RETURN true; END IF;
 PERFORM set_config('tidy.pipeline_move','on',true);
 UPDATE public.contractor_pipeline SET stage='active',activated_at=now(),probation_visits_remaining=coalesce(probation_visits_remaining,3),coi_effective_date=(SELECT coi_effective_date FROM public.applicants WHERE id=_id),coi_expiry_date=(SELECT coi_expires_at FROM public.applicants WHERE id=_id) WHERE applicant_id=_id AND NOT archived AND state='open';
 UPDATE public.applicants SET signing_day_active_at=now(),current_stage='active',sequence_stage='active' WHERE id=_id;
 RETURN true;
END $$;