-- Phase 1: contractor onboarding tracking columns
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS stripe_connect_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_passed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipment_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS training_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS training_no_show_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS out_of_service_area boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_applicants_stage_entered_at
  ON public.applicants (stage_entered_at)
  WHERE current_stage NOT IN ('active', 'rejected');

CREATE INDEX IF NOT EXISTS idx_applicants_stripe_account_id
  ON public.applicants (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

-- Equipment photos table
CREATE TABLE IF NOT EXISTS public.applicant_equipment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  photo_type text NOT NULL,
  storage_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aep_applicant ON public.applicant_equipment_photos (applicant_id);
CREATE INDEX IF NOT EXISTS idx_aep_status    ON public.applicant_equipment_photos (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicant_equipment_photos TO authenticated;
GRANT ALL ON public.applicant_equipment_photos TO service_role;

ALTER TABLE public.applicant_equipment_photos ENABLE ROW LEVEL SECURITY;

-- Admins: full access
CREATE POLICY "aep admin all"
  ON public.applicant_equipment_photos
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Applicants can read their own photos (matched via applicants.contractor_id = auth.uid())
CREATE POLICY "aep applicant select own"
  ON public.applicant_equipment_photos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.applicants a
      WHERE a.id = applicant_equipment_photos.applicant_id
        AND a.contractor_id = auth.uid()
    )
  );

-- Applicants can insert their own photos
CREATE POLICY "aep applicant insert own"
  ON public.applicant_equipment_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.applicants a
      WHERE a.id = applicant_equipment_photos.applicant_id
        AND a.contractor_id = auth.uid()
    )
  );

-- updated_at trigger
CREATE TRIGGER trg_aep_updated_at
  BEFORE UPDATE ON public.applicant_equipment_photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();