
-- Lifecycle messaging engine: contacts, sequences, templates, queue.

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  zip TEXT,
  lang TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('en','es')),
  lifecycle_stage TEXT NOT NULL DEFAULT 'PRICE_SEEN',
  source TEXT,
  src_tag TEXT,
  sms_service BOOLEAN NOT NULL DEFAULT false,
  sms_marketing BOOLEAN NOT NULL DEFAULT false,
  email_marketing BOOLEAN NOT NULL DEFAULT true,
  email_suppressed BOOLEAN NOT NULL DEFAULT false,
  sms_stopped BOOLEAN NOT NULL DEFAULT false,
  is_test BOOLEAN NOT NULL DEFAULT false,
  last_marketing_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contacts_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX contacts_email_key ON public.contacts (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX contacts_phone_key ON public.contacts (phone) WHERE phone IS NOT NULL;
CREATE INDEX contacts_stage_idx ON public.contacts (lifecycle_stage);

GRANT SELECT ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read contacts" ON public.contacts FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lifecycle_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email')),
  subject_en TEXT,
  subject_es TEXT,
  body_en TEXT NOT NULL,
  body_es TEXT,
  es_reviewed BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_templates TO authenticated;
GRANT ALL ON public.lifecycle_templates TO service_role;
ALTER TABLE public.lifecycle_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage lifecycle templates" ON public.lifecycle_templates FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.lifecycle_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage TEXT NOT NULL,
  step_order INT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email','task')),
  template_key TEXT,
  marketing BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  condition JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage, step_order, channel)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lifecycle_sequences TO authenticated;
GRANT ALL ON public.lifecycle_sequences TO service_role;
ALTER TABLE public.lifecycle_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage lifecycle sequences" ON public.lifecycle_sequences FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  step_order INT,
  template_key TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('sms','email','task')),
  marketing BOOLEAN NOT NULL DEFAULT true,
  tokens JSONB NOT NULL DEFAULT '{}',
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','cancelled','dry_run','task_open','task_done')),
  provider_id TEXT,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX message_queue_due_idx ON public.message_queue (status, send_at);
CREATE INDEX message_queue_contact_idx ON public.message_queue (contact_id, status);

GRANT SELECT ON public.message_queue TO authenticated;
GRANT ALL ON public.message_queue TO service_role;
ALTER TABLE public.message_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read message queue" ON public.message_queue FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Quiet hours: marketing/lifecycle texts 8:00-18:00 ET Mon-Sat, never Sunday.
-- Emails follow the same window for lifecycle mail. Returns the next allowed time.
CREATE OR REPLACE FUNCTION public.lifecycle_next_send_time(_at TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  local_ts TIMESTAMP := _at AT TIME ZONE 'America/New_York';
  d DATE; t TIME;
BEGIN
  LOOP
    d := local_ts::date; t := local_ts::time;
    IF extract(isodow from d) = 7 THEN
      local_ts := (d + 1)::timestamp + time '08:00'; CONTINUE;
    END IF;
    IF t < time '08:00' THEN
      local_ts := d::timestamp + time '08:00'; CONTINUE;
    END IF;
    IF t >= time '18:00' THEN
      local_ts := (d + 1)::timestamp + time '08:00'; CONTINUE;
    END IF;
    RETURN local_ts AT TIME ZONE 'America/New_York';
  END LOOP;
END;
$$;

-- Stage change: cancel every queued message from the old stage, set the new
-- stage, and queue the new stage's active steps (quiet-hours adjusted).
CREATE OR REPLACE FUNCTION public.lifecycle_set_stage(_contact_id UUID, _stage TEXT, _tokens JSONB DEFAULT '{}')
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.message_queue
  SET status = 'cancelled'
  WHERE contact_id = _contact_id AND status = 'queued' AND stage IS DISTINCT FROM _stage;

  UPDATE public.contacts
  SET lifecycle_stage = _stage, updated_at = now()
  WHERE id = _contact_id;

  INSERT INTO public.message_queue (contact_id, stage, step_order, template_key, channel, marketing, tokens, send_at)
  SELECT _contact_id, s.stage, s.step_order, s.template_key, s.channel, s.marketing, _tokens,
         public.lifecycle_next_send_time(now() + make_interval(mins => s.delay_minutes))
  FROM public.lifecycle_sequences s
  WHERE s.stage = _stage AND s.active;
END;
$$;

-- Orphans: active contacts with no queued next message.
CREATE OR REPLACE FUNCTION public.lifecycle_orphans()
RETURNS SETOF public.contacts
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.* FROM public.contacts c
  WHERE c.lifecycle_stage <> 'SUPPRESSED'
    AND NOT EXISTS (
      SELECT 1 FROM public.message_queue q
      WHERE q.contact_id = c.id AND q.status = 'queued'
    );
$$;
