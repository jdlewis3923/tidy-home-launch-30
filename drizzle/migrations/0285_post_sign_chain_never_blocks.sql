ALTER TABLE public.contractor_stage_events DROP CONSTRAINT contractor_stage_events_kind_check;
ALTER TABLE public.contractor_stage_events ADD CONSTRAINT contractor_stage_events_kind_check CHECK (kind = ANY (ARRAY['advance','activate','hold','resume','decline','withdraw','restore','override','lapse','reinstate','migrate','refused','proof_review','proof_link','reference','probation','message','note','gate_satisfied']::text[]));

-- A failure in the follow-up steps must never undo a saved signature; it raises an urgent alert instead.
CREATE OR REPLACE FUNCTION public.applicant_contract_signed_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.contracts_signed AND NOT coalesce(OLD.contracts_signed,false) THEN
    BEGIN
      PERFORM public.contract_post_sign(NEW.id);
      UPDATE public.contract_signatures s SET pro_number=a.pro_number FROM public.applicants a
       WHERE a.id=NEW.id AND s.applicant_id=NEW.id AND s.pro_number IS NULL;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.integration_logs(source,event,status,error_message,detail)
      VALUES('internal','contract_post_sign','error',left(sqlerrm,500),jsonb_build_object('applicant_id',NEW.id));
      INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,context,action_url,dedupe_key)
      VALUES('post_sign_failed','critical','hiring',CASE WHEN coalesce(NEW.is_test_row,false) THEN 'dashboard' ELSE 'urgent' END,
        coalesce(nullif(trim(coalesce(NEW.first_name,'')||' '||coalesce(NEW.last_name,'')),''),'A Pro')||' signed, but the follow-up steps failed',
        'Signature is saved. Follow-up error: '||left(sqlerrm,300),jsonb_build_object('applicant_id',NEW.id),'/admin/pipeline/'||NEW.id,'post-sign-failed:'||NEW.id)
      ON CONFLICT (dedupe_key) DO NOTHING;
    END;
  END IF;
  RETURN NEW;
END $$;