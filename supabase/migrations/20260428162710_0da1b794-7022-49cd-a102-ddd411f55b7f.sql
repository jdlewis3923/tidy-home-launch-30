-- 1) stripe_events for webhook idempotency
CREATE TABLE public.stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received', -- received | processed | error | skipped
  error_message text,
  duration_ms integer,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_stripe_events_type_received ON public.stripe_events (event_type, received_at DESC);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stripe_events admin select"
  ON public.stripe_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Subscription dunning + cancellation columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pause_collection text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS latest_invoice_attempt_count integer;

-- 3) Profile attribution + tier
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_source text,
  ADD COLUMN IF NOT EXISTS service_tier text;