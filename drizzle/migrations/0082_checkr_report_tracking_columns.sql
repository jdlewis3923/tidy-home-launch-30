-- Checkr report tracking on applicants.
-- Deliberately stores ONLY Checkr identifiers, status and timestamps.
-- No SSN, date of birth or driver's licence number is ever stored by Tidy —
-- Checkr collects those directly from the candidate.
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS checkr_report_id text,
  ADD COLUMN IF NOT EXISTS checkr_report_status text,
  ADD COLUMN IF NOT EXISTS bg_check_ordered_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkr_last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS bg_check_manual_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS applicants_checkr_report_id_idx
  ON public.applicants (checkr_report_id);
