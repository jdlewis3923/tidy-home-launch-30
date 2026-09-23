CREATE TABLE public.admin_workday_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid,
  title text NOT NULL,
  detail text,
  status text,
  action_label text,
  action_url text,
  waiting_on_admin boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE ON public.admin_workday_events TO authenticated;
GRANT ALL ON public.admin_workday_events TO service_role;
ALTER TABLE public.admin_workday_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read workday events" ON public.admin_workday_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can add workday events" ON public.admin_workday_events FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update workday events" ON public.admin_workday_events FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX admin_workday_events_time_idx ON public.admin_workday_events (occurred_at DESC);
CREATE INDEX admin_workday_events_applicant_idx ON public.admin_workday_events (applicant_id, occurred_at DESC);
CREATE INDEX admin_workday_events_waiting_idx ON public.admin_workday_events (waiting_on_admin, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.capture_applicant_workday_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := trim(coalesce(NEW.first_name, '') || ' ' || coalesce(NEW.last_name, ''));
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
    VALUES (
      'application_submitted', NEW.id,
      'New application — ' || coalesce(nullif(v_name, ''), 'Unnamed applicant'),
      concat_ws(' · ', NEW.service, NEW.zip, CASE WHEN NEW.experience_years IS NULL THEN NULL ELSE NEW.experience_years || ' years experience' END),
      NEW.hiring_tier, 'View applicant', '/admin/applicants?id=' || NEW.id, true,
      jsonb_strip_nulls(to_jsonb(NEW) - ARRAY['coi_token','intake_token','verify_token','badge_token','ein','coi_policy_number'])
    );
  ELSIF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
    VALUES ('stage_change', NEW.id, coalesce(nullif(v_name, ''), 'Applicant') || ' stage changed', coalesce(OLD.current_stage, '—') || ' → ' || coalesce(NEW.current_stage, '—'), NEW.current_stage, 'View applicant', '/admin/applicants?id=' || NEW.id, NEW.current_stage IN ('applied','screening','interview','offer','bg_check','contracts','kit'), jsonb_build_object('from', OLD.current_stage, 'to', NEW.current_stage));
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.bg_check_status IS DISTINCT FROM OLD.bg_check_status THEN
    INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
    VALUES ('background_check', NEW.id, 'Background check — ' || coalesce(nullif(v_name, ''), 'Applicant'), coalesce(NEW.bg_check_status, 'updated'), NEW.bg_check_status, 'View applicant', '/admin/applicants?id=' || NEW.id, NEW.bg_check_status IN ('consider','suspended'), '{}'::jsonb);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.call_at IS DISTINCT FROM OLD.call_at AND NEW.call_at IS NOT NULL THEN
    INSERT INTO public.admin_workday_events(event_type, applicant_id, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
    VALUES ('call_booked', NEW.id, 'Call booked — ' || coalesce(nullif(v_name, ''), 'Applicant'), NEW.call_at::text, 'booked', 'View applicant', '/admin/applicants?id=' || NEW.id, false, jsonb_build_object('call_at', NEW.call_at));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER applicants_workday_events AFTER INSERT OR UPDATE OF current_stage, bg_check_status, call_at ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.capture_applicant_workday_event();

CREATE OR REPLACE FUNCTION public.capture_email_workday_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.channel = 'email' THEN
    INSERT INTO public.admin_workday_events(event_type, occurred_at, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
    VALUES ('email', NEW.triggered_at, 'Email ' || NEW.status || ' — ' || NEW.template_name, NEW.recipient || CASE WHEN NEW.error_message IS NULL THEN '' ELSE ' · ' || NEW.error_message END, NEW.status, 'Open email log', '/admin/email-health', NEW.status IN ('failed','bounced'), jsonb_build_object('email_log_id', NEW.id, 'template', NEW.template_name, 'recipient', NEW.recipient));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER email_workday_events AFTER INSERT ON public.email_send_log FOR EACH ROW EXECUTE FUNCTION public.capture_email_workday_event();

CREATE OR REPLACE FUNCTION public.capture_onboarding_workday_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_type text;
BEGIN
  IF NEW.event = 'applicant_submitted' THEN RETURN NEW; END IF;
  SELECT trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) INTO v_name FROM public.applicants WHERE id = NEW.applicant_id;
  v_type := CASE
    WHEN NEW.event LIKE 'checkr%' THEN 'background_check'
    WHEN NEW.event LIKE 'coi_%' OR NEW.event LIKE 'insurance_%' THEN 'insurance'
    WHEN NEW.event LIKE 'intake%' THEN 'intake'
    ELSE 'stage_change'
  END;
  INSERT INTO public.admin_workday_events(event_type, applicant_id, occurred_at, title, detail, status, action_label, action_url, waiting_on_admin, metadata)
  VALUES (v_type, NEW.applicant_id, NEW.created_at, replace(NEW.event, '_', ' ') || ' — ' || coalesce(nullif(v_name, ''), 'Applicant'), NEW.metadata::text, NEW.event, 'View applicant', '/admin/applicants?id=' || NEW.applicant_id, NEW.event LIKE '%consider%' OR NEW.event LIKE '%submitted%' OR NEW.event LIKE '%rejected%', NEW.metadata);
  RETURN NEW;
END;
$$;
CREATE TRIGGER onboarding_workday_events AFTER INSERT ON public.onboarding_events FOR EACH ROW EXECUTE FUNCTION public.capture_onboarding_workday_event();