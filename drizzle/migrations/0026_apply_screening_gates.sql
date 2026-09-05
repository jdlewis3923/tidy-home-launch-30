-- Add Indeed-style screening gates to the public /apply form.
-- All four columns are nullable so existing rows stay valid.

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS bilingual boolean,
  ADD COLUMN IF NOT EXISTS insurance_willing boolean,
  ADD COLUMN IF NOT EXISTS fl_license boolean,
  ADD COLUMN IF NOT EXISTS license_expiry date;

-- Keep the existing applicants table grants intact.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applicants TO authenticated;
GRANT ALL ON public.applicants TO service_role;
