-- Profiles: SMS preference + dedupe timestamps
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sms_preference TEXT NOT NULL DEFAULT 'all'
    CHECK (sms_preference IN ('all','needs_me','critical')),
  ADD COLUMN IF NOT EXISTS last_pv4_review_request_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_addon_attached_at TIMESTAMPTZ;

-- Generic SMS log (volume analytics)
CREATE TABLE IF NOT EXISTS public.sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  sms_type TEXT NOT NULL,
  twilio_message_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suppressed BOOLEAN NOT NULL DEFAULT false,
  suppression_reason TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_log_user_sent_idx ON public.sms_log (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS sms_log_type_sent_idx ON public.sms_log (sms_type, sent_at DESC);
ALTER TABLE public.sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_log select own" ON public.sms_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "sms_log admin select" ON public.sms_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Per-visit SMS dedupe
CREATE TABLE IF NOT EXISTS public.visit_sms_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  jobber_visit_id TEXT NOT NULL UNIQUE,
  visit_date DATE,
  morning_sms_sent BOOLEAN NOT NULL DEFAULT false,
  morning_sms_sent_at TIMESTAMPTZ,
  morning_sms_suppressed BOOLEAN NOT NULL DEFAULT false,
  morning_sms_suppression_reason TEXT,
  eta_sms_sent BOOLEAN NOT NULL DEFAULT false,
  eta_sms_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.visit_sms_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "visit_sms_state admin select" ON public.visit_sms_state FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add-on attaches
CREATE TABLE IF NOT EXISTS public.addon_attaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  jobber_visit_id TEXT,
  jobber_job_id TEXT,
  jobber_line_item_id TEXT,
  stripe_invoice_item_id TEXT,
  stripe_addon_price_id TEXT NOT NULL,
  addon_key TEXT NOT NULL,
  addon_name TEXT NOT NULL,
  addon_price_cents INTEGER NOT NULL,
  service_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending_visit'
    CHECK (status IN ('pending_visit','completed','removed','failed')),
  attached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS addon_attaches_user_idx ON public.addon_attaches (user_id, attached_at DESC);
CREATE INDEX IF NOT EXISTS addon_attaches_visit_idx ON public.addon_attaches (jobber_visit_id);
ALTER TABLE public.addon_attaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addon_attaches select own" ON public.addon_attaches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "addon_attaches admin select" ON public.addon_attaches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Magic-link tokens for /add/{token}
CREATE TABLE IF NOT EXISTS public.addon_attach_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.addon_attach_tokens ENABLE ROW LEVEL SECURITY;
-- No policies → only service role can read/write.

-- Add-on attach SMS log
CREATE TABLE IF NOT EXISTS public.addon_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  jobber_visit_id TEXT,
  variant TEXT,
  twilio_content_sid TEXT,
  twilio_message_id TEXT,
  sent_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  suppression_reason TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS addon_sms_log_user_idx ON public.addon_sms_log (user_id, created_at DESC);
ALTER TABLE public.addon_sms_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addon_sms_log admin select" ON public.addon_sms_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger on visit_sms_state
DROP TRIGGER IF EXISTS visit_sms_state_set_updated_at ON public.visit_sms_state;
CREATE TRIGGER visit_sms_state_set_updated_at
  BEFORE UPDATE ON public.visit_sms_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();