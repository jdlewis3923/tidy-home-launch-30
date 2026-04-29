ALTER TABLE public.applicants RENAME COLUMN checkr_candidate_id TO yardstik_candidate_id;
ALTER TABLE public.applicants RENAME COLUMN checkr_report_id TO yardstik_screening_id;
ALTER TABLE public.applicants RENAME COLUMN checkr_status TO yardstik_status;
ALTER TABLE public.applicants RENAME COLUMN checkr_completed_at TO yardstik_completed_at;