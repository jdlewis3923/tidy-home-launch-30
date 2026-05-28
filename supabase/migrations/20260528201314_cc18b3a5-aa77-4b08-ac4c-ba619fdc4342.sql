ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS checkr_candidate_id text,
  ADD COLUMN IF NOT EXISTS checkr_invitation_id text;