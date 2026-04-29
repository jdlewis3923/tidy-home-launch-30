-- Onboarding events timeline (admin-only)
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_applicant
  ON public.onboarding_events(applicant_id, created_at DESC);

ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_events admin select"
  ON public.onboarding_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "onboarding_events admin insert"
  ON public.onboarding_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "onboarding_events admin delete"
  ON public.onboarding_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Stripe Connect Express stub queue (TODO: real API call later)
CREATE TABLE IF NOT EXISTS public.stripe_connect_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  role text,
  status text NOT NULL DEFAULT 'pending_api_call',
  stripe_account_id text,
  onboarding_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_connect_pending_applicant
  ON public.stripe_connect_pending(applicant_id);

ALTER TABLE public.stripe_connect_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_connect_pending admin select"
  ON public.stripe_connect_pending FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "stripe_connect_pending admin insert"
  ON public.stripe_connect_pending FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "stripe_connect_pending admin update"
  ON public.stripe_connect_pending FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER set_stripe_connect_pending_updated_at
  BEFORE UPDATE ON public.stripe_connect_pending
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();