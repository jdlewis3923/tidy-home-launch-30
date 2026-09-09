-- (1) Rating integrity: per-visit capability token proves the submitter is the
-- customer who was texted the link; per-rating follow-up token proves the
-- follow-up comes from whoever submitted that rating. One rating per visit.
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS rate_token text;
UPDATE public.visits SET rate_token = encode(gen_random_bytes(16),'hex') WHERE rate_token IS NULL;
ALTER TABLE public.visits ALTER COLUMN rate_token SET DEFAULT encode(gen_random_bytes(16),'hex');
CREATE UNIQUE INDEX IF NOT EXISTS visits_rate_token_key ON public.visits(rate_token);
REVOKE SELECT (rate_token) ON public.visits FROM anon, authenticated;

ALTER TABLE public.visit_ratings ADD COLUMN IF NOT EXISTS followup_token text;
ALTER TABLE public.visit_ratings ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS visit_ratings_one_per_visit
  ON public.visit_ratings(visit_id) WHERE visit_id IS NOT NULL;

GRANT ALL ON public.visits TO service_role;
GRANT ALL ON public.visit_ratings TO service_role;
