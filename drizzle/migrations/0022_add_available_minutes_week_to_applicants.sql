ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS available_minutes_week integer NOT NULL DEFAULT 2400;