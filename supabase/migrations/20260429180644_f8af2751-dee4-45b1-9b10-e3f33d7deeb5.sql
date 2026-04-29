-- =========================================================
-- Phase A: Applicants (Tidy hiring pipeline)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.applicants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Personal info captured by /apply form
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT,
  zip             TEXT,
  notes_for_admin TEXT,

  -- Phase A required columns
  service                  TEXT,
  checkr_candidate_id      TEXT,
  checkr_report_id         TEXT,
  checkr_status            TEXT,
  checkr_completed_at      TIMESTAMPTZ,
  current_stage            TEXT DEFAULT 'applied',
  stage_entered_at         TIMESTAMPTZ DEFAULT NOW(),
  rejection_reason         TEXT,
  rejected_at              TIMESTAMPTZ
);

-- In case the table already existed, ensure all Phase A columns are present.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS checkr_candidate_id TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS checkr_report_id TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS checkr_status TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS checkr_completed_at TIMESTAMPTZ;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'applied';
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS service TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS applicants_current_stage_idx ON public.applicants (current_stage);
CREATE INDEX IF NOT EXISTS applicants_email_idx ON public.applicants (lower(email));
CREATE INDEX IF NOT EXISTS applicants_checkr_candidate_idx ON public.applicants (checkr_candidate_id);

-- Auto-bump stage_entered_at whenever current_stage changes
CREATE OR REPLACE FUNCTION public.update_stage_entered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF NEW.current_stage IS DISTINCT FROM OLD.current_stage THEN
    NEW.stage_entered_at = NOW();
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS applicant_stage_change ON public.applicants;
CREATE TRIGGER applicant_stage_change
BEFORE UPDATE ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.update_stage_entered_at();

-- Reuse existing public.update_updated_at_column trigger function for updated_at
DROP TRIGGER IF EXISTS applicants_set_updated_at ON public.applicants;
CREATE TRIGGER applicants_set_updated_at
BEFORE UPDATE ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;

-- Anyone (anon or authed) can submit a new application via /apply.
-- The submit-application edge function is the canonical writer; this policy
-- also allows direct client inserts as a safety net.
DROP POLICY IF EXISTS "applicants insert public" ON public.applicants;
CREATE POLICY "applicants insert public"
ON public.applicants
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Admins can do everything else.
DROP POLICY IF EXISTS "applicants admin select" ON public.applicants;
CREATE POLICY "applicants admin select"
ON public.applicants FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "applicants admin update" ON public.applicants;
CREATE POLICY "applicants admin update"
ON public.applicants FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "applicants admin delete" ON public.applicants;
CREATE POLICY "applicants admin delete"
ON public.applicants FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));