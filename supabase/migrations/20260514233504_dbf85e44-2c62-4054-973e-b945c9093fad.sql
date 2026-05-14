
ALTER TABLE public.applicants RENAME COLUMN open_quality_escalations TO open_escalations_count;
ALTER TABLE public.applicants ADD COLUMN contractor_id uuid;
ALTER TABLE public.applicants ADD CONSTRAINT applicants_contractor_id_unique UNIQUE (contractor_id);
ALTER TABLE public.applicants ADD COLUMN jobber_id text;
ALTER TABLE public.applicants ADD COLUMN google_review_match_name text;
ALTER TABLE public.applicants ADD COLUMN last_visit_at timestamptz;
ALTER TABLE public.applicants ADD COLUMN total_ratings_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.applicants ADD COLUMN contractor_cancel_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.applicants ADD COLUMN complaint_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.applicants ADD COLUMN photos_uploaded_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.applicants ADD COLUMN photos_expected_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.applicants ADD COLUMN last_jobber_event_at timestamptz;
ALTER TABLE public.applicants ADD COLUMN last_review_match_at timestamptz;
CREATE INDEX applicants_contractor_id_idx ON public.applicants(contractor_id);
CREATE INDEX applicants_jobber_id_idx ON public.applicants(jobber_id);
DROP POLICY IF EXISTS "applicants pro select own" ON public.applicants;
CREATE POLICY "applicants pro select own" ON public.applicants
  FOR SELECT TO authenticated
  USING (auth.uid() = contractor_id);
