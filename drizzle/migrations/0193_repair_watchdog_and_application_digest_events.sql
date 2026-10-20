DO $repair$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.capture_cron_health()'::regprocedure) INTO definition;
 definition := replace(definition, 'DELETE FROM public.cron_health_snapshot;', 'DELETE FROM public.cron_health_snapshot WHERE jobid IS NOT NULL;');
 EXECUTE definition;
END $repair$;

CREATE OR REPLACE FUNCTION public.capture_completed_application_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a public.applicants; label text;
BEGIN
 IF NEW.apply_submitted_at IS NULL OR OLD.apply_submitted_at IS NOT NULL OR NEW.is_test OR NEW.archived THEN RETURN NEW; END IF;
 SELECT * INTO a FROM public.applicants WHERE id = NEW.applicant_id;
 IF a.is_test_row THEN RETURN NEW; END IF;
 label := trim(coalesce(a.first_name,'') || ' ' || coalesce(a.last_name,''));
 INSERT INTO public.admin_workday_events(event_type,applicant_id,title,detail,action_label,action_url,waiting_on_admin,metadata)
 VALUES ('application_completed',NEW.applicant_id,'Application completed — ' || label,NEW.service,'Open candidate','/admin/pipeline/' || NEW.applicant_id,true,jsonb_build_object('submitted_at',NEW.apply_submitted_at));
 INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,action_label,action_url,dedupe_key,context)
 VALUES ('application_completed','action','hiring','digest','Application completed — ' || label,'Application saved. Review the Fit Report and equipment photos.','Open candidate','/admin/pipeline/' || NEW.applicant_id,'application_completed:' || NEW.applicant_id,jsonb_build_object('applicant_id',NEW.applicant_id)) ON CONFLICT (dedupe_key) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_completed_application_alert AFTER UPDATE OF apply_submitted_at ON public.contractor_pipeline FOR EACH ROW EXECUTE FUNCTION public.capture_completed_application_alert();
REVOKE ALL ON FUNCTION public.capture_completed_application_alert() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_completed_application_alert() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_candidate_texts_read(_id uuid, _through timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
 UPDATE public.admin_alerts SET resolved_at=now() WHERE alert_type='hiring_unread_reply' AND resolved_at IS NULL AND context->>'applicant_id'=_id::text AND created_at<=least(_through,now());
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_candidate_texts_read(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_candidate_texts_read(uuid,timestamptz) TO authenticated,service_role;