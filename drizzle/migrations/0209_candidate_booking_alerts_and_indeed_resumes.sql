CREATE TABLE public.candidate_indeed_resumes (
 applicant_id uuid PRIMARY KEY REFERENCES public.applicants(id) ON DELETE CASCADE,
 resume_text text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.candidate_indeed_resumes TO authenticated;
GRANT ALL ON public.candidate_indeed_resumes TO service_role;
ALTER TABLE public.candidate_indeed_resumes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage Indeed resumes" ON public.candidate_indeed_resumes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.hiring_slot_owner_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a record; p record; who text; at_time text; label text;
BEGIN
 IF NEW.status <> 'booked' OR NEW.applicant_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.status='booked' AND OLD.applicant_id IS NOT DISTINCT FROM NEW.applicant_id AND OLD.starts_at IS NOT DISTINCT FROM NEW.starts_at THEN RETURN NEW; END IF;
 END IF;
 SELECT first_name,last_name,phone,is_test_row INTO a FROM public.applicants WHERE id=NEW.applicant_id;
 SELECT archived,is_test INTO p FROM public.contractor_pipeline WHERE applicant_id=NEW.applicant_id;
 IF a IS NULL OR p IS NULL OR coalesce(a.is_test_row,false) OR coalesce(p.is_test,false) OR coalesce(p.archived,false) THEN RETURN NEW; END IF;
 who:=coalesce(nullif(trim(coalesce(a.first_name,'')||' '||coalesce(a.last_name,'')),''),'Candidate');
 at_time:=to_char(NEW.starts_at AT TIME ZONE 'America/New_York','Dy Mon DD, YYYY HH12:MI AM')||' ET';
 label:=CASE WHEN NEW.kind='phone' THEN 'phone call' ELSE 'in-person interview' END;
 INSERT INTO public.admin_alerts(alert_type,level,category,tier,night_ok,title,body,what,why_today,if_ignored,action_label,action_url,dedupe_key,context)
 VALUES('hiring_appointment_booked','action','hiring','urgent',true,who||' booked a '||label||': '||at_time,who||' · '||at_time||' · Phone: '||coalesce(a.phone,'not on file'),who||' booked a '||label||' for '||at_time,'A candidate selected or changed an appointment.','You could miss the appointment.','Open candidate','/admin/pipeline/'||NEW.applicant_id,'hiring_booked:'||NEW.kind||':'||NEW.applicant_id||':'||NEW.id||':'||extract(epoch from NEW.starts_at)::text,jsonb_build_object('applicant_id',NEW.applicant_id,'slot_id',NEW.id,'starts_at',NEW.starts_at,'kind',NEW.kind))
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hiring_slot_owner_alert() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER hiring_slot_owner_alert AFTER INSERT OR UPDATE OF status,applicant_id,starts_at ON public.hiring_slots FOR EACH ROW EXECUTE FUNCTION public.hiring_slot_owner_alert();