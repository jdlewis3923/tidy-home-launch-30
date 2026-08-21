ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paused_until timestamptz NULL;