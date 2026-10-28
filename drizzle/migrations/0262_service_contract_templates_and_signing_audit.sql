CREATE TABLE public.contract_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service text NOT NULL CHECK (service IN ('cleaning','lawn')), lang text NOT NULL DEFAULT 'en' CHECK (lang='en'), version text NOT NULL, title text NOT NULL, body text NOT NULL, is_current boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(service,lang,version));
GRANT SELECT ON public.contract_templates TO authenticated;
GRANT ALL ON public.contract_templates TO service_role;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read contract templates" ON public.contract_templates FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE UNIQUE INDEX contract_templates_one_current ON public.contract_templates(service,lang) WHERE is_current;
ALTER TABLE public.applicants ADD COLUMN contract_template_id uuid REFERENCES public.contract_templates(id);
ALTER TABLE public.contract_signatures ADD COLUMN template_id uuid REFERENCES public.contract_templates(id), ADD COLUMN template_service text, ADD COLUMN template_body text, ADD COLUMN business_name text NOT NULL DEFAULT '—', ADD COLUMN pro_number text, ADD COLUMN placeholder_values jsonb NOT NULL DEFAULT '{}', ADD COLUMN countersigned_at timestamptz, ADD COLUMN countersigned_by uuid, ADD COLUMN countersigner_name text, ADD COLUMN countersigned_ip text, ADD COLUMN final_pdf_path text;
CREATE UNIQUE INDEX contract_signatures_one_template ON public.contract_signatures(applicant_id,template_id) WHERE template_id IS NOT NULL;
COMMENT ON COLUMN public.applicants.w9_status IS 'DEPRECATED: taxpayer information collected only by Stripe Connect; not a signing or readiness requirement.';
DO $patch$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.signing_day_state(uuid)'::regprocedure) INTO d;
d := replace(d, 'AND coalesce(w9,false) ', '');
d := replace(d, '''w9'',coalesce(w9,false),', '');
d := replace(d, '''kit_status'',k.status)', '''kit_status'',k.status,''contract_token'',CASE WHEN public.is_privileged_caller() THEN a.contract_token ELSE NULL END,''countersigned_at'',(SELECT max(s.countersigned_at) FROM public.contract_signatures s WHERE s.applicant_id=a.id),''app_logged_in'',EXISTS(SELECT 1 FROM auth.users u WHERE u.id=a.contractor_id AND u.last_sign_in_at IS NOT NULL))');
EXECUTE d;
SELECT pg_get_functiondef('public.pipeline_missing(uuid)'::regprocedure) INTO d;
d := replace(d, 'SELECT EXISTS (SELECT 1 FROM public.contractor_artifacts WHERE applicant_id = _id AND kind = ''w9'') INTO has_art;', 'has_art := true;');
d := replace(d, 'IF NOT has_art THEN m := array_append(m, ''W-9''::text); END IF;', '');
d := replace(d, 'IF NOT has_art THEN m := array_append(m, ''Signed ICA''::text); END IF;', 'IF NOT has_art AND NOT coalesce(a.contracts_signed,false) THEN m := array_append(m, ''Signed ICA''::text); END IF;');
EXECUTE d;
END $patch$;
CREATE OR REPLACE FUNCTION public.contract_commit_signature(_applicant uuid,_template uuid,_document uuid,_version text,_body text,_typed text,_business text,_ip text,_ua text,_path text,_values jsonb,_signed_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.applicants; s uuid; BEGIN
IF auth.role()<>'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT * INTO a FROM public.applicants WHERE id=_applicant FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
IF a.contracts_signed THEN RETURN jsonb_build_object('already',true); END IF;
IF NOT EXISTS(SELECT 1 FROM public.contractor_pipeline WHERE applicant_id=a.id AND proof_approved_at IS NOT NULL AND NOT archived AND state='open') THEN RAISE EXCEPTION 'equipment_approval_required'; END IF;
IF _template IS NOT NULL AND (a.contract_template_id IS DISTINCT FROM _template OR NOT EXISTS(SELECT 1 FROM public.contract_templates WHERE id=_template AND version=_version AND body=_body)) THEN RAISE EXCEPTION 'template_changed'; END IF;
INSERT INTO public.contract_signatures(applicant_id,typed_name,signed_at,ip_address,user_agent,document_id,document_version,signed_pdf_path,template_id,template_service,template_body,business_name,pro_number,placeholder_values) VALUES(a.id,_typed,_signed_at,_ip,_ua,_document,_version,_path,_template,(SELECT service FROM public.contract_templates WHERE id=_template),_body,coalesce(nullif(_business,''),'—'),a.pro_number,_values) RETURNING id INTO s;
INSERT INTO public.company_documents(filename,category,tags,storage_path,mime_type,current_version,searchable_text) VALUES('ICA-signed-'||s::text||'.pdf','Contracts',ARRAY['signed','ica',a.id::text],_path,'application/pdf',true,_body);
INSERT INTO public.contractor_artifacts(applicant_id,kind,storage_path,filename) VALUES(a.id,'ica_signed',_path,'Tidy-Contractor-Agreement-signed.pdf');
UPDATE public.applicants SET contracts_signed=true,contracts_signed_at=_signed_at,contract_signed_name=_typed,contract_signed_ip=_ip,contract_signed_ua=_ua,contract_doc_version=_version,contract_signed_pdf_path=_path WHERE id=a.id;
INSERT INTO public.onboarding_events(applicant_id,event,metadata) VALUES(a.id,'contract_signed',jsonb_build_object('signature_id',s,'version',_version));
RETURN jsonb_build_object('ok',true,'signature_id',s);
END $$;
REVOKE ALL ON FUNCTION public.contract_commit_signature(uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contract_commit_signature(uuid,uuid,uuid,text,text,text,text,text,text,text,jsonb,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.contract_commit_countersign(_signature uuid,_actor uuid,_ip text,_path text,_at timestamptz) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.contract_signatures; BEGIN
IF auth.role()<>'service_role' OR NOT public.has_role(_actor,'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
SELECT * INTO s FROM public.contract_signatures WHERE id=_signature FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
IF s.countersigned_at IS NOT NULL THEN RETURN jsonb_build_object('already',true); END IF;
UPDATE public.contract_signatures SET countersigned_at=_at,countersigned_by=_actor,countersigner_name='Justin Lewis, Founder — Tidy Home Concierge LLC',countersigned_ip=_ip,final_pdf_path=_path WHERE id=s.id;
UPDATE public.applicants SET contract_signed_pdf_path=_path WHERE id=s.applicant_id;
INSERT INTO public.company_documents(filename,category,tags,storage_path,mime_type,current_version,searchable_text) VALUES('ICA-final-'||s.id::text||'.pdf','Contracts',ARRAY['signed','countersigned','ica',s.applicant_id::text],_path,'application/pdf',true,s.template_body);
INSERT INTO public.onboarding_events(applicant_id,event,metadata) VALUES(s.applicant_id,'contract_countersigned',jsonb_build_object('signature_id',s.id,'actor',_actor,'at',_at));
RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.contract_commit_countersign(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.contract_commit_countersign(uuid,uuid,text,text,timestamptz) TO service_role;