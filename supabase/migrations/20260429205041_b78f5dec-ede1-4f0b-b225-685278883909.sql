ALTER TABLE public.applicants RENAME COLUMN yardstik_status TO bg_check_status;
ALTER TABLE public.applicants RENAME COLUMN yardstik_completed_at TO bg_check_completed_at;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS yardstik_candidate_id;
ALTER TABLE public.applicants DROP COLUMN IF EXISTS yardstik_screening_id;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS bg_check_provider TEXT;
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS bg_check_notes TEXT;