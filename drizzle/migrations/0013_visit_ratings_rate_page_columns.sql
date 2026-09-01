ALTER TABLE public.visit_ratings
  ADD COLUMN IF NOT EXISTS job_id text,
  ADD COLUMN IF NOT EXISTS customer_id text,
  ADD COLUMN IF NOT EXISTS stars integer,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS needs_followup boolean NOT NULL DEFAULT false;

UPDATE public.visit_ratings SET stars = rating WHERE stars IS NULL;

CREATE INDEX IF NOT EXISTS visit_ratings_needs_followup_idx
  ON public.visit_ratings (needs_followup) WHERE needs_followup;

GRANT INSERT ON public.visit_ratings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visit_ratings TO authenticated;
GRANT ALL ON public.visit_ratings TO service_role;

ALTER TABLE public.visit_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visit_ratings_anon_insert ON public.visit_ratings;
CREATE POLICY visit_ratings_anon_insert
  ON public.visit_ratings FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS visit_ratings_admin_select ON public.visit_ratings;
CREATE POLICY visit_ratings_admin_select
  ON public.visit_ratings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));