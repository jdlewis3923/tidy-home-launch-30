ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS checkr_invite_sent_at timestamptz;
CREATE TABLE public.onboarding_pack_sends (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE, item text NOT NULL, body text NOT NULL, links jsonb NOT NULL DEFAULT '{}', sms_status text NOT NULL DEFAULT 'pending', email_status text NOT NULL DEFAULT 'pending', sms_result jsonb, email_result jsonb, release_after timestamptz, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.onboarding_pack_sends TO authenticated;
GRANT ALL ON public.onboarding_pack_sends TO service_role;
ALTER TABLE public.onboarding_pack_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY onboarding_pack_admin_read ON public.onboarding_pack_sends FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.restore_responsive_candidate(_id uuid, _event text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.contractor_pipeline; nm text;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id=_id FOR UPDATE;
 IF NOT FOUND OR NOT p.archived OR coalesce(p.is_test,false) OR lower(coalesce(p.archive_reason,'')) NOT IN ('no_apply','unresponsive','no_response','no_proof','silence') THEN RETURN false; END IF;
 PERFORM set_config('tidy.pipeline_move','on',true);
 UPDATE public.contractor_pipeline SET archived=false,archived_at=NULL,state='open',archive_reason=NULL,decline_reason=NULL WHERE applicant_id=_id;
 SELECT concat_ws(' ',first_name,last_name) INTO nm FROM public.applicants WHERE id=_id;
 INSERT INTO public.contractor_stage_events(applicant_id,kind,reason,metadata) VALUES(_id,'message','Automatically restored: '||_event,jsonb_build_object('prior_archive_reason',p.archive_reason,'restore_event',_event));
 INSERT INTO public.admin_alerts(alert_type,level,category,title,body,action_label,action_url,dedupe_key,context) VALUES('candidate_restored','critical','hiring',nm||' returned to the pipeline',nm||' '||_event||'. Prior archive: '||p.archive_reason,'Open candidate','/admin/pipeline/'||_id,'restore:'||_id||':'||coalesce(p.archived_at::text,p.updated_at::text),jsonb_build_object('applicant_id',_id)) ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.restore_responsive_candidate(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.restore_responsive_candidate(uuid,text) TO service_role,authenticated;
CREATE OR REPLACE FUNCTION public.restore_completed_candidate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.apply_submitted_at IS NOT NULL AND OLD.apply_submitted_at IS DISTINCT FROM NEW.apply_submitted_at AND OLD.archived AND NOT coalesce(NEW.is_test,false) AND lower(coalesce(OLD.archive_reason,'')) IN ('no_apply','unresponsive','no_response','no_proof','silence') THEN
   PERFORM set_config('tidy.pipeline_move','on',true);
   NEW.archived:=false; NEW.archived_at:=NULL; NEW.state:='open'; NEW.archive_reason:=NULL; NEW.decline_reason:=NULL;
   INSERT INTO public.admin_alerts(alert_type,level,category,title,body,action_label,action_url,dedupe_key,context) SELECT 'candidate_restored','critical','hiring',concat_ws(' ',a.first_name,a.last_name)||' finished their application', 'Archived candidate restored automatically after completing the application.','Open candidate','/admin/pipeline/'||NEW.applicant_id,'restore-complete:'||NEW.applicant_id||':'||NEW.apply_submitted_at,jsonb_build_object('applicant_id',NEW.applicant_id) FROM public.applicants a WHERE a.id=NEW.applicant_id ON CONFLICT(dedupe_key) DO NOTHING;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER a_restore_completed_candidate BEFORE UPDATE OF apply_submitted_at ON public.contractor_pipeline FOR EACH ROW EXECUTE FUNCTION public.restore_completed_candidate();