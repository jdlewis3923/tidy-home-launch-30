CREATE TABLE public.sms_delivery_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_sid text,
  message_status text,
  to_number text,
  from_number text,
  error_code integer,
  error_message text,
  messaging_service_sid text,
  raw jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_delivery_events_message_sid_idx ON public.sms_delivery_events (message_sid);
CREATE INDEX sms_delivery_events_received_at_idx ON public.sms_delivery_events (received_at DESC);

-- Lockdown: service role (edge function) only. No anon, no authenticated grants.
REVOKE ALL ON public.sms_delivery_events FROM anon, authenticated;
GRANT ALL ON public.sms_delivery_events TO service_role;

ALTER TABLE public.sms_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view sms delivery events"
  ON public.sms_delivery_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));