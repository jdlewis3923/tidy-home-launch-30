-- Phase 4 follow-up: give integration_logs a structured detail column so the
-- inert Jobber stubs can record WHO called them (function name + caller
-- fingerprint) rather than returning a silent 200.
ALTER TABLE public.integration_logs
  ADD COLUMN IF NOT EXISTS detail jsonb;

CREATE INDEX IF NOT EXISTS integration_logs_source_event_created_idx
  ON public.integration_logs (source, event, created_at DESC);
