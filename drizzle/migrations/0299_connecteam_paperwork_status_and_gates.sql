ALTER TABLE public.pro_pay_profiles ADD COLUMN IF NOT EXISTS applicant_id uuid, ADD COLUMN IF NOT EXISTS service_line text, ADD COLUMN IF NOT EXISTS paperwork_status jsonb NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS paperwork_complete boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS paperwork_synced_at timestamptz, ADD COLUMN IF NOT EXISTS agreement_signed_at timestamptz, ADD COLUMN IF NOT EXISTS coi_expires_at timestamptz, ADD COLUMN IF NOT EXISTS pay_setup_unblocked boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.applicants.documenso_document_ids IS 'DEPRECATED: historical signing provider IDs; current paperwork lives in Connecteam';
COMMENT ON TABLE public.documenso_templates IS 'DEPRECATED: preserved historical signing templates; paperwork now managed in Connecteam';
CREATE OR REPLACE FUNCTION public.connecteam_commit_paperwork(_user bigint,_status jsonb,_complete boolean,_signed_at timestamptz,_expiry timestamptz,_coi_approved boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a uuid;
BEGIN
 UPDATE public.pro_pay_profiles SET paperwork_status=_status,paperwork_complete=_complete,agreement_signed_at=_signed_at,coi_expires_at=_expiry,pay_setup_unblocked=_complete,coi_verified_at=CASE WHEN _coi_approved THEN coalesce(coi_verified_at,now()) ELSE NULL END,paperwork_synced_at=now() WHERE connecteam_user_id=_user RETURNING applicant_id INTO a;
 IF a IS NOT NULL AND _complete AND _signed_at IS NOT NULL THEN
 UPDATE public.applicants SET contracts_signed=true,contracts_signed_at=coalesce(contracts_signed_at,_signed_at) WHERE id=a AND NOT contracts_signed;
 END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.connecteam_commit_paperwork(bigint,jsonb,boolean,timestamptz,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.connecteam_commit_paperwork(bigint,jsonb,boolean,timestamptz,timestamptz,boolean) TO service_role;
DO $change$ DECLARE f text; startpos integer; endpos integer; BEGIN
 SELECT pg_get_functiondef('public.contract_post_sign(uuid)'::regprocedure) INTO f;
 startpos:=position('  INSERT INTO public.admin_alerts' in f);endpos:=position('  RETURN jsonb_build_object' in f);
 IF startpos>0 AND endpos>startpos THEN f:=substring(f from 1 for startpos-1)||substring(f from endpos); EXECUTE f; END IF;
 SELECT pg_get_functiondef('public.assign_jobber_visit_pro(uuid,bigint)'::regprocedure) INTO f;
 f:=replace(f,'WHERE p.active AND p.service_line=v.service_line','WHERE p.active AND p.service_line=v.service_line AND NOT EXISTS (SELECT 1 FROM public.pro_pay_profiles insurance WHERE insurance.connecteam_user_id=p.connecteam_user_id AND insurance.coi_expires_at IS NOT NULL AND insurance.coi_expires_at <= v.start_at)');
 EXECUTE f;
END $change$;