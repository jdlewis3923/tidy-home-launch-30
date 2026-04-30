-- Email/SMS audit log for /admin/email-health
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  recipient text NOT NULL,
  triggered_by text,
  brevo_message_id text,
  twilio_sid text,
  status text NOT NULL CHECK (status IN ('queued','sent','delivered','failed','bounced')),
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_triggered_at
  ON public.email_send_log (triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_send_log_template
  ON public.email_send_log (template_name, triggered_at DESC);

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_send_log admin select"
  ON public.email_send_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "email_send_log admin insert"
  ON public.email_send_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
