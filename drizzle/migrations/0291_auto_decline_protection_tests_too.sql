CREATE OR REPLACE FUNCTION public.pipeline_protect_auto_decline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE why text; nm text;
BEGIN
  IF NEW.archived AND NOT OLD.archived AND NEW.state='declined' AND NEW.decline_reason='Unresponsive' THEN
    why := public.candidate_protection_reason(NEW.applicant_id);
    IF why IS NOT NULL THEN
      INSERT INTO public.auto_decline_blocks(applicant_id,attempted_reason,protection) VALUES(NEW.applicant_id,NEW.archive_reason,why);
      SELECT nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'') INTO nm FROM public.applicants WHERE id=NEW.applicant_id;
      INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,context,action_url,dedupe_key)
      VALUES('auto_decline_blocked','action','hiring',CASE WHEN coalesce(NEW.is_test,false) THEN 'dashboard' ELSE 'digest' END,
        'Kept '||coalesce(nm,'a candidate')||' active — your call',
        'The system tried to decline them for '||coalesce(NEW.archive_reason,'silence')||', but they '||why||'. Decide manually.',
        jsonb_build_object('applicant_id',NEW.applicant_id,'attempted',NEW.archive_reason,'protection',why,'is_test',coalesce(NEW.is_test,false)),'/admin/pipeline/'||NEW.applicant_id,
        'auto-decline-blocked:'||NEW.applicant_id||':'||to_char(now(),'YYYY-MM-DD'))
      ON CONFLICT (dedupe_key) DO NOTHING;
      NEW.archived := OLD.archived; NEW.archived_at := OLD.archived_at; NEW.state := OLD.state;
      NEW.archived_from_stage := OLD.archived_from_stage; NEW.archive_reason := OLD.archive_reason; NEW.decline_reason := OLD.decline_reason;
    END IF;
  END IF;
  RETURN NEW;
END $$;