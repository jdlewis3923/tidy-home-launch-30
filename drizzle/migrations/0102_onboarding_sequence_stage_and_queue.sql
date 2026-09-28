ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS sequence_stage text,
  ADD COLUMN IF NOT EXISTS sequence_stage_entered_at timestamptz;

ALTER TABLE public.applicants DROP CONSTRAINT IF EXISTS applicants_sequence_stage_chk;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_sequence_stage_chk CHECK (sequence_stage IS NULL OR sequence_stage IN
 ('applied','screening','interview_booked','waiting','contract_sent','signed','photo_approved','kit_ordered','all_set','active','declined','cold','hold'));

UPDATE public.applicants a SET sequence_stage = CASE
    WHEN a.current_stage = 'active' THEN 'active'
    WHEN a.current_stage = 'rejected' THEN 'declined'
    WHEN a.all_set_sent_at IS NOT NULL THEN 'all_set'
    WHEN a.contracts_signed IS TRUE THEN 'signed'
    WHEN a.contract_sent_at IS NOT NULL THEN 'contract_sent'
    WHEN a.onboarding_email_sent_at IS NOT NULL THEN 'waiting'
    WHEN a.call_at IS NOT NULL THEN 'interview_booked'
    WHEN a.queue_state IN ('texted','reached','contacted') THEN 'screening'
    ELSE 'applied' END,
  sequence_stage_entered_at = COALESCE(a.stage_entered_at, now())
WHERE a.sequence_stage IS NULL;

ALTER TABLE public.applicants ALTER COLUMN sequence_stage SET DEFAULT 'applied';
ALTER TABLE public.applicants ALTER COLUMN sequence_stage_entered_at SET DEFAULT now();

CREATE TABLE IF NOT EXISTS public.sequence_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  email_key text NOT NULL,
  due_at timestamptz NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  result text
);
CREATE UNIQUE INDEX IF NOT EXISTS sequence_email_queue_pending_uq
  ON public.sequence_email_queue(applicant_id, email_key) WHERE released_at IS NULL;
GRANT SELECT ON public.sequence_email_queue TO authenticated;
GRANT ALL ON public.sequence_email_queue TO service_role;
ALTER TABLE public.sequence_email_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sequence queue" ON public.sequence_email_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.capture_sequence_stage_workday()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sequence_stage IS DISTINCT FROM OLD.sequence_stage THEN
    NEW.sequence_stage_entered_at := now();
    INSERT INTO public.admin_workday_events(event_type, applicant_id, actor_type, title, detail, status, metadata)
    VALUES ('sequence_stage', (to_jsonb(NEW)->>'id')::uuid, 'system',
      coalesce(to_jsonb(NEW)->>'first_name','Pro') || ' → ' || NEW.sequence_stage,
      'Stage changed from ' || coalesce(OLD.sequence_stage,'none') || ' to ' || NEW.sequence_stage,
      'info', jsonb_build_object('from', OLD.sequence_stage, 'to', NEW.sequence_stage));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sequence_stage_workday ON public.applicants;
CREATE TRIGGER trg_sequence_stage_workday BEFORE UPDATE OF sequence_stage ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.capture_sequence_stage_workday();

SELECT cron.schedule('sequence-tick-hourly', '0 * * * *',
  $job$SELECT public.cron_http_post('sequence-tick-hourly', 'sequence-tick', '{}'::jsonb);$job$);