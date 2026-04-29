-- Phase A reconciliation: add columns expected by new spec, keep existing columns intact.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS experience_years integer,
  ADD COLUMN IF NOT EXISTS has_vehicle boolean,
  ADD COLUMN IF NOT EXISTS has_supplies boolean;

-- Allow new stage values used by advance-applicant (offer_sent, contract_signed, demo_passed, active).
-- current_stage is currently a free text column with no CHECK constraint, so no schema change needed.

-- Storage bucket "tidy-docs" for the Phase A document library uploads.
INSERT INTO storage.buckets (id, name, public)
VALUES ('tidy-docs', 'tidy-docs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for tidy-docs bucket: admins only.
DROP POLICY IF EXISTS "tidy-docs admin read" ON storage.objects;
DROP POLICY IF EXISTS "tidy-docs admin write" ON storage.objects;
DROP POLICY IF EXISTS "tidy-docs admin update" ON storage.objects;
DROP POLICY IF EXISTS "tidy-docs admin delete" ON storage.objects;

CREATE POLICY "tidy-docs admin read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tidy-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "tidy-docs admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tidy-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "tidy-docs admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tidy-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "tidy-docs admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tidy-docs' AND public.has_role(auth.uid(), 'admin'::public.app_role));