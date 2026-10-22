CREATE OR REPLACE FUNCTION public.hire_ready_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record;
BEGIN
 FOR j IN UPDATE public.hire_ready_invite_jobs SET status='failed',error='No completion recorded within 10 minutes; check delivery before any resend.' WHERE status='sending' AND requested_at < now()-interval '10 minutes' RETURNING * LOOP
 INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,dedupe_key,context)
 VALUES('hiring_invite_failure','warning','hiring','digest','Hire-ready invitation needs review',j.error,'hire_ready_timeout:'||j.id,jsonb_build_object('applicant_id',j.applicant_id)) ON CONFLICT(dedupe_key) DO NOTHING;
 END LOOP;
 IF extract(hour FROM now() AT TIME ZONE 'America/New_York') NOT BETWEEN 8 AND 19 THEN RETURN; END IF;
 UPDATE public.hire_ready_invite_jobs hj SET status='skipped',completed_at=now()
 WHERE hj.status='pending' AND (EXISTS(SELECT 1 FROM public.contractor_pipeline p WHERE p.applicant_id=hj.applicant_id AND (p.archived OR p.is_test OR p.apply_submitted_at IS NOT NULL)) OR (hj.kind='nudge' AND EXISTS(SELECT 1 FROM public.application_answers a WHERE a.candidate_id=hj.applicant_id)));
 FOR j IN SELECT * FROM public.hire_ready_invite_jobs WHERE status='pending' AND due_at<=now() AND (requested_at IS NULL OR requested_at<now()-interval '10 minutes') LOOP
 UPDATE public.hire_ready_invite_jobs SET requested_at=now() WHERE id=j.id;
 PERFORM public.call_edge_function('hire-ready-dispatch',jsonb_build_object('job_id',j.id));
 END LOOP;
 FOR j IN SELECT DISTINCT applicant_id FROM public.hire_ready_invite_jobs WHERE kind='invite' AND archive_at<=now() LOOP
 IF EXISTS(SELECT 1 FROM public.contractor_pipeline WHERE applicant_id=j.applicant_id AND NOT archived AND NOT is_test AND apply_submitted_at IS NULL) THEN
 PERFORM set_config('tidy.pipeline_move','on',true);
 UPDATE public.contractor_pipeline SET archived=true,archived_at=now(),archived_from_stage=stage,state='declined',archive_reason='no_apply',decline_reason='No Tidy submission within 48 hours of hire-ready invite' WHERE applicant_id=j.applicant_id AND NOT archived AND NOT is_test AND apply_submitted_at IS NULL;
 PERFORM public.pipeline_log(j.applicant_id,'decline',NULL,NULL,'open','declined','48-hour hire-ready application window expired');
 END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.hire_ready_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hire_ready_tick() TO service_role;