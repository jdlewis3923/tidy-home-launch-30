-- Phase 3: Jobber field-service sync linkage
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS jobber_client_id TEXT,
  ADD COLUMN IF NOT EXISTS jobber_job_ids JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS jobber_visit_id TEXT,
  ADD COLUMN IF NOT EXISTS jobber_job_id TEXT;

-- Unique on jobber_visit_id (only when present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'visits_jobber_visit_id_unique'
  ) THEN
    CREATE UNIQUE INDEX visits_jobber_visit_id_unique
      ON public.visits(jobber_visit_id)
      WHERE jobber_visit_id IS NOT NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_visits_jobber_job_id ON public.visits(jobber_job_id);
CREATE INDEX IF NOT EXISTS idx_subs_jobber_client_id ON public.subscriptions(jobber_client_id);