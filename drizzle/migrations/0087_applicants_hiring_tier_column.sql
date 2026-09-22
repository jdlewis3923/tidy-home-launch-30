-- The existing applicants.tier column holds the pro pay tier (tier_1_verified …)
-- and feeds contractor pay. The hiring queue's A/B/C ranking needs its own
-- column so scoring can never overwrite a pay tier.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS hiring_tier TEXT;
COMMENT ON COLUMN public.applicants.hiring_tier IS 'Hiring queue ranking A/B/C from the applicant score. Not the pay tier.';