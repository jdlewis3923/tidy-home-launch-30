-- The dedupe index was partial (only unresolved rows), so upserts could not use
-- it and every autopilot alert silently failed to write. A plain unique index
-- lets the same key re-open instead of stacking. NULLs stay unconstrained, so
-- older alerts without a key are unaffected.
DROP INDEX IF EXISTS public.admin_alerts_dedupe_key_open_idx;
DROP INDEX IF EXISTS public.admin_alerts_dedupe_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS admin_alerts_dedupe_key_unique
  ON public.admin_alerts (dedupe_key);