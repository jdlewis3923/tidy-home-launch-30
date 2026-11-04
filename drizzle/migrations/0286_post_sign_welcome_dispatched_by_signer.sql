CREATE OR REPLACE FUNCTION public.contract_post_sign(_applicant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.applicants; p public.contractor_pipeline; nm text; num text; moved boolean := false; test boolean;
BEGIN
  SELECT * INTO a FROM public.applicants WHERE id=_applicant FOR UPDATE;
  IF NOT FOUND OR NOT a.contracts_signed THEN RETURN jsonb_build_object('ok',false,'reason','not_signed'); END IF;
  SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id=_applicant FOR UPDATE;
  nm := nullif(trim(coalesce(a.first_name,'')||' '||coalesce(a.last_name,'')),'');
  test := coalesce(a.is_test_row,false) OR coalesce(p.is_test,false);
  num := coalesce(nullif(a.pro_number,''), CASE WHEN test THEN 'TEST-'||upper(substr(replace(_applicant::text,'-',''),1,4)) ELSE coalesce(nullif(a.pro_number_reserved,''),'TIDY-'||lpad(nextval('public.pro_number_seq_v2')::text,4,'0')) END);
  UPDATE public.applicants SET pro_number=num, sequence_stage='signed',
    signing_day_signed_at=coalesce(signing_day_signed_at, contracts_signed_at, now()),
    contract_sent_at=coalesce(contract_sent_at, contracts_signed_at, now())
   WHERE id=_applicant;
  UPDATE public.pro_kit SET pro_no=num WHERE applicant_id=_applicant;
  IF p.applicant_id IS NOT NULL AND NOT p.archived AND p.state='open' THEN
    PERFORM set_config('tidy.pipeline_move','on',true);
    IF public.pipeline_stage_index(p.stage) < public.pipeline_stage_index('agreement') THEN
      PERFORM public.pipeline_log(_applicant,'gate_satisfied',p.stage,'agreement',p.state,p.state,
        'owner-sent agreement satisfies interview/screen gates', jsonb_build_object('source','contract_post_sign'));
      UPDATE public.contractor_pipeline SET stage='agreement', stage_entered_at=now(),
        screening_call_completed_at=coalesce(screening_call_completed_at, now()),
        agreement_docs_sent_at=coalesce(agreement_docs_sent_at, a.contract_sent_at, now())
       WHERE applicant_id=_applicant;
      PERFORM public.pipeline_log(_applicant,'advance',p.stage,'agreement','open','open','contract signed');
      moved := true;
    ELSE
      UPDATE public.contractor_pipeline SET agreement_docs_sent_at=coalesce(agreement_docs_sent_at, a.contract_sent_at, now()) WHERE applicant_id=_applicant;
    END IF;
    PERFORM set_config('tidy.pipeline_move','',true);
  END IF;
  INSERT INTO public.onboarding_events(applicant_id,event,metadata) VALUES(_applicant,'post_sign_chain',jsonb_build_object('pro_number',num,'moved',moved,'test',test));
  INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,context,action_url,dedupe_key)
  VALUES('contract_signed','action','hiring', CASE WHEN test THEN 'dashboard' ELSE 'urgent' END,
    coalesce(nm,'A Pro')||' signed — next step: send the Checkr background check invite',
    'Agreement signed and saved. Pro number '||num||'. Welcome and insurance-quote messages go out automatically (quiet hours respected).',
    jsonb_build_object('applicant_id',_applicant,'is_test',test),'/admin/pipeline/'||_applicant,'contract-signed:'||_applicant)
  ON CONFLICT (dedupe_key) DO NOTHING;
  -- Welcome is dispatched by the signer (contract-sign / documenso-webhook) with its own credentials.
  RETURN jsonb_build_object('ok',true,'pro_number',num,'moved',moved);
END $$;
REVOKE ALL ON FUNCTION public.contract_post_sign(uuid) FROM PUBLIC, anon, authenticated;