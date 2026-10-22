CREATE TABLE public.hire_ready_invite_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES public.applicants(id),
 campaign text NOT NULL, kind text NOT NULL CHECK(kind IN ('invite','nudge')), service text NOT NULL,
 language text NOT NULL CHECK(language IN ('en','es','bilingual')), due_at timestamptz NOT NULL,
 finish_at timestamptz NOT NULL, archive_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','done','failed','skipped')),
 requested_at timestamptz, completed_at timestamptz, email_status text NOT NULL DEFAULT 'scheduled',
 sms_status text NOT NULL DEFAULT 'scheduled', twilio_sid text, error text,
 UNIQUE(applicant_id,campaign,kind)
);
GRANT ALL ON public.hire_ready_invite_jobs TO service_role;
GRANT SELECT ON public.hire_ready_invite_jobs TO authenticated;
ALTER TABLE public.hire_ready_invite_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_read ON public.hire_ready_invite_jobs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));
CREATE INDEX hire_ready_pending_due ON public.hire_ready_invite_jobs(due_at) WHERE status='pending';
CREATE OR REPLACE FUNCTION public.hire_ready_claim(_job_id uuid) RETURNS SETOF public.hire_ready_invite_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.hire_ready_invite_jobs;
BEGIN
 SELECT * INTO j FROM public.hire_ready_invite_jobs WHERE id=_job_id AND status='pending' AND due_at<=now() FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF extract(hour FROM now() AT TIME ZONE 'America/New_York') NOT BETWEEN 8 AND 19 THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.contractor_pipeline p WHERE p.applicant_id=j.applicant_id AND NOT p.archived AND NOT p.is_test AND p.apply_submitted_at IS NULL)
 OR (j.kind='nudge' AND EXISTS(SELECT 1 FROM public.application_answers WHERE candidate_id=j.applicant_id)) THEN
 UPDATE public.hire_ready_invite_jobs SET status='skipped',completed_at=now() WHERE id=j.id; RETURN;
 END IF;
 RETURN QUERY UPDATE public.hire_ready_invite_jobs SET status='sending',requested_at=now() WHERE id=j.id RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.hire_ready_claim(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hire_ready_claim(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.hire_ready_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j record;
BEGIN
 -- Stale accepted jobs are uncertain, not automatically retried.
 FOR j IN UPDATE public.hire_ready_invite_jobs SET status='failed',error='No completion recorded within 10 minutes; check delivery before any resend.' WHERE status='sending' AND requested_at < now()-interval '10 minutes' RETURNING * LOOP
 INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,dedupe_key,context)
 VALUES('hiring_invite_failure','warning','hiring','digest','Hire-ready invitation needs review',j.error,'hire_ready_timeout:'||j.id,jsonb_build_object('applicant_id',j.applicant_id)) ON CONFLICT(dedupe_key) DO NOTHING;
 END LOOP;
 IF extract(hour FROM now() AT TIME ZONE 'America/New_York') NOT BETWEEN 8 AND 19 THEN RETURN; END IF;
 UPDATE public.hire_ready_invite_jobs j SET status='skipped',completed_at=now()
 WHERE status='pending' AND (EXISTS(SELECT 1 FROM public.contractor_pipeline p WHERE p.applicant_id=j.applicant_id AND (p.archived OR p.is_test OR p.apply_submitted_at IS NOT NULL)) OR (kind='nudge' AND EXISTS(SELECT 1 FROM public.application_answers a WHERE a.candidate_id=j.applicant_id)));
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
CREATE OR REPLACE FUNCTION public.hire_ready_submission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.apply_submitted_at IS NOT NULL AND OLD.apply_submitted_at IS NULL AND EXISTS(SELECT 1 FROM public.hire_ready_invite_jobs WHERE applicant_id=NEW.applicant_id) THEN
 UPDATE public.hire_ready_invite_jobs SET status='skipped',completed_at=now() WHERE applicant_id=NEW.applicant_id AND status='pending';
 PERFORM public.hiring_set_deadline(NEW.applicant_id,'book_phone',now()+interval '48 hours',NULL);
 PERFORM public.call_edge_function('pipeline-notify',jsonb_build_object('applicant_id',NEW.applicant_id,'event','book_phone'));
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER hire_ready_submission AFTER UPDATE OF apply_submitted_at ON public.contractor_pipeline FOR EACH ROW EXECUTE FUNCTION public.hire_ready_submission();