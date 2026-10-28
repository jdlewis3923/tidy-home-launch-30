ALTER TABLE public.pro_kit ADD COLUMN IF NOT EXISTS signing_day_mode boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS emergency_name text, ADD COLUMN IF NOT EXISTS emergency_phone text, ADD COLUMN IF NOT EXISTS emergency_relationship text, ADD COLUMN IF NOT EXISTS equipment_checked jsonb NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS availability_zips jsonb NOT NULL DEFAULT '[]', ADD COLUMN IF NOT EXISTS intake_updated_at timestamptz;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS signing_day_signed_at timestamptz, ADD COLUMN IF NOT EXISTS signing_day_signed_by uuid, ADD COLUMN IF NOT EXISTS signing_day_active_at timestamptz, ADD COLUMN IF NOT EXISTS signing_day_app_sms_at timestamptz, ADD COLUMN IF NOT EXISTS signing_day_active_sms_at timestamptz;
CREATE OR REPLACE FUNCTION public.signing_day_state(_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.applicants; p public.contractor_pipeline; k public.pro_kit; own boolean; bg boolean; ins boolean; pay boolean; avail boolean; sizes boolean; w9 boolean; proof boolean; ready boolean;
BEGIN
 SELECT * INTO a FROM public.applicants WHERE (_id IS NOT NULL AND id=_id) OR (_id IS NULL AND contractor_id=auth.uid()) ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 own := a.contractor_id=auth.uid();
 IF NOT coalesce(own,false) AND NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id=a.id;
 SELECT * INTO k FROM public.pro_kit WHERE applicant_id=a.id ORDER BY created_at DESC LIMIT 1;
 bg := a.bg_check_status='clear' OR p.checkr_result='clear';
 ins := a.coi_review_status IN ('approved','verified') AND a.coi_effective_date <= current_date AND a.coi_expires_at>current_date AND a.coi_pdf_url IS NOT NULL AND a.coi_carrier_name IS NOT NULL AND a.coi_policy_number IS NOT NULL AND coalesce((a.gate_confirmations->>'coi_limits_ok')::boolean,false);
 pay := a.stripe_connect_complete AND a.stripe_account_id IS NOT NULL;
 avail := jsonb_array_length(coalesce(k.days,'[]'))>0 AND nullif(trim(k.hours),'') IS NOT NULL AND jsonb_array_length(coalesce(k.availability_zips,'[]'))>0;
 sizes := k.submitted_at IS NOT NULL AND nullif(k.shirt_size,'') IS NOT NULL AND (public.pipeline_service_key(a.service)<>'lawn' OR nullif(k.vest_size,'') IS NOT NULL);
 w9 := a.w9_status IN ('received','approved','complete') OR EXISTS(SELECT 1 FROM public.contractor_artifacts WHERE applicant_id=a.id AND kind='w9');
 proof := p.proof_approved_at IS NOT NULL AND a.equipment_approved;
 ready := a.signing_day_signed_at IS NOT NULL AND a.contracts_signed AND coalesce(bg,false) AND coalesce(ins,false) AND coalesce(pay,false) AND coalesce(avail,false) AND coalesce(sizes,false) AND coalesce(w9,false) AND coalesce(proof,false) AND a.training_passed AND NOT coalesce(p.archived,true) AND p.state='open';
 RETURN jsonb_build_object('applicant_id',a.id,'first_name',a.first_name,'service',a.service,'pro_number',a.pro_number,'signed_at',a.signing_day_signed_at,'active_at',a.signing_day_active_at,'mode',a.signing_day_signed_at IS NOT NULL,'active',a.current_stage='active','ready',coalesce(ready,false),'intake_complete',k.submitted_at IS NOT NULL,'intake_token',k.token,'background',coalesce(bg,false),'insurance',coalesce(ins,false),'payouts',coalesce(pay,false),'availability',coalesce(avail,false),'sizes',coalesce(sizes,false),'agreement',a.contracts_signed,'w9',coalesce(w9,false),'equipment',coalesce(proof,false),'training',a.training_passed,'insurance_review',a.coi_review_status,'insurance_uploaded_at',a.coi_uploaded_at,'kit_order_ready',k.submitted_at IS NOT NULL AND coalesce(ins,false),'kit_status',k.status);
END $$;
REVOKE ALL ON FUNCTION public.signing_day_state(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signing_day_state(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_signing_day_intake(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF EXISTS(SELECT 1 FROM public.contractor_pipeline WHERE applicant_id=_id AND archived) THEN RAISE EXCEPTION 'candidate_archived'; END IF;
 result := public.admin_onboarding_tokens(_id,false);
 UPDATE public.pro_kit SET signing_day_mode=true,service_line=coalesce(service_line,(SELECT CASE public.pipeline_service_key(service) WHEN 'lawn' THEN 'Lawn Care' WHEN 'car' THEN 'Car Care' ELSE 'House Cleaning' END FROM public.applicants WHERE id=_id)) WHERE token=result->>'intake_token';
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_signing_day_intake(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signing_day_intake(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.signing_intake_save(_token text,_patch jsonb,_submit boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.pro_kit; p jsonb:=coalesce(_patch,'{}'); result jsonb; f text; v jsonb;
BEGIN
 IF length(coalesce(_token,''))<20 OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>20000 THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT * INTO k FROM public.pro_kit WHERE token=_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
 IF k.token_expires_at<now() THEN RETURN jsonb_build_object('state','expired'); END IF;
 IF k.status<>'sent' THEN RETURN jsonb_build_object('state','closed'); END IF;
 FOR f,v IN SELECT * FROM jsonb_each(p) LOOP
   IF jsonb_typeof(v)='string' AND length(v#>>'{}')>2000 THEN RAISE EXCEPTION 'field_too_long'; END IF;
 END LOOP;
 IF p ? 'emergency_phone' AND nullif(p->>'emergency_phone','') IS NOT NULL AND length(regexp_replace(p->>'emergency_phone','\D','','g')) NOT BETWEEN 10 AND 15 THEN RAISE EXCEPTION 'invalid_emergency_phone'; END IF;
 IF p ? 'email' AND nullif(p->>'email','') IS NOT NULL AND p->>'email' !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
 IF p ? 'home_zip' AND nullif(p->>'home_zip','') IS NOT NULL AND p->>'home_zip' !~ '^\d{5}$' THEN RAISE EXCEPTION 'invalid_zip'; END IF;
 IF p ? 'availability_zips' THEN
   IF jsonb_typeof(p->'availability_zips')<>'array' OR jsonb_array_length(p->'availability_zips')>30 THEN RAISE EXCEPTION 'invalid_zips'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'availability_zips') z WHERE z !~ '^\d{5}$') THEN RAISE EXCEPTION 'invalid_zips'; END IF;
 END IF;
 IF p ? 'equipment_checked' AND (jsonb_typeof(p->'equipment_checked')<>'array' OR jsonb_array_length(p->'equipment_checked')>100) THEN RAISE EXCEPTION 'invalid_equipment'; END IF;
 UPDATE public.pro_kit SET emergency_name=CASE WHEN p?'emergency_name' THEN nullif(trim(p->>'emergency_name'),'') ELSE emergency_name END,emergency_phone=CASE WHEN p?'emergency_phone' THEN nullif(p->>'emergency_phone','') ELSE emergency_phone END,emergency_relationship=CASE WHEN p?'emergency_relationship' THEN nullif(trim(p->>'emergency_relationship'),'') ELSE emergency_relationship END,equipment_checked=coalesce(p->'equipment_checked',equipment_checked),availability_zips=coalesce(p->'availability_zips',availability_zips),intake_updated_at=now() WHERE id=k.id;
 result := public.intake_save(_token,p,false);
 IF result->>'state'<>'open' THEN RETURN result; END IF;
 IF _submit THEN
   SELECT * INTO k FROM public.pro_kit WHERE id=k.id;
   IF k.signing_day_mode AND (nullif(trim(k.legal_name),'') IS NULL OR nullif(trim(k.badge_name),'') IS NULL OR nullif(k.mobile,'') IS NULL OR nullif(k.email,'') IS NULL OR k.home_zip IS NULL OR nullif(trim(k.mail_address),'') IS NULL OR k.emergency_name IS NULL OR k.emergency_phone IS NULL OR k.emergency_relationship IS NULL OR k.shirt_size IS NULL OR k.shirt_cut IS NULL OR k.magnets_opt_in IS NULL OR jsonb_array_length(k.days)=0 OR nullif(trim(k.hours),'') IS NULL OR jsonb_array_length(k.availability_zips)=0 OR jsonb_array_length(k.equipment_checked)=0 OR (public.pipeline_service_key(k.service_line)='lawn' AND k.vest_size IS NULL)) THEN RAISE EXCEPTION 'required_intake_fields_missing'; END IF;
   result := public.intake_save(_token,'{}',true);
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.signing_intake_save(text,jsonb,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signing_intake_save(text,jsonb,boolean) TO anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.signing_day_allocate_number(_id uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.applicants; num text; BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO a FROM public.applicants WHERE id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
 num:=coalesce(nullif(a.pro_number,''),CASE WHEN coalesce(a.is_test_row,false) OR EXISTS(SELECT 1 FROM public.contractor_pipeline WHERE applicant_id=_id AND is_test) THEN 'TEST-'||upper(substr(replace(_id::text,'-',''),1,4)) ELSE coalesce(nullif(a.pro_number_reserved,''),'TIDY-'||lpad(nextval('public.pro_number_seq_v2')::text,4,'0')) END);
 UPDATE public.applicants SET pro_number=num WHERE id=_id;
 UPDATE public.pro_kit SET pro_no=num WHERE applicant_id=_id;
 RETURN num;
END $$;
REVOKE ALL ON FUNCTION public.signing_day_allocate_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signing_day_allocate_number(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.signing_day_recheck() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE app uuid; BEGIN
 app:=CASE WHEN TG_TABLE_NAME='applicants' THEN (to_jsonb(NEW)->>'id')::uuid ELSE (to_jsonb(NEW)->>'applicant_id')::uuid END;
 IF EXISTS(SELECT 1 FROM public.applicants WHERE id=app AND signing_day_signed_at IS NOT NULL AND signing_day_active_at IS NULL) THEN
   PERFORM public.call_edge_function('sequence-advance',jsonb_build_object('applicant_id',app,'action','signing_day_activate'));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER signing_day_applicant_ready AFTER UPDATE OF bg_check_status,coi_review_status,stripe_connect_complete,training_passed,equipment_approved,w9_status,gate_confirmations,contracts_signed ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.signing_day_recheck();
CREATE TRIGGER signing_day_kit_ready AFTER UPDATE OF submitted_at,days,hours,availability_zips,shirt_size,vest_size ON public.pro_kit FOR EACH ROW EXECUTE FUNCTION public.signing_day_recheck();
CREATE TRIGGER signing_day_pipeline_ready AFTER UPDATE OF checkr_result,proof_approved_at ON public.contractor_pipeline FOR EACH ROW EXECUTE FUNCTION public.signing_day_recheck();