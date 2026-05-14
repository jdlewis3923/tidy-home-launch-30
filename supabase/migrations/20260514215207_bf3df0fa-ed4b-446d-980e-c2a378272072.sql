
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'tier_1_verified'
    CHECK (tier IN ('tier_1_verified','tier_2_pro_partner')),
  ADD COLUMN IF NOT EXISTS tier_advanced_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_visits integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_customer_rating numeric(3,2)
    CHECK (avg_customer_rating IS NULL OR (avg_customer_rating >= 0 AND avg_customer_rating <= 5)),
  ADD COLUMN IF NOT EXISTS contractor_cancel_rate numeric(5,4),
  ADD COLUMN IF NOT EXISTS complaint_rate numeric(5,4),
  ADD COLUMN IF NOT EXISTS photo_compliance_rate numeric(5,4),
  ADD COLUMN IF NOT EXISTS open_quality_escalations integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier_readiness_status text NOT NULL DEFAULT 'not_eligible'
    CHECK (tier_readiness_status IN ('not_eligible','eligible','offered','declined','promoted')),
  ADD COLUMN IF NOT EXISTS tier_offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS tier_offered_by uuid;

CREATE INDEX IF NOT EXISTS applicants_tier_idx ON public.applicants(tier);
CREATE INDEX IF NOT EXISTS applicants_tier_readiness_idx ON public.applicants(tier_readiness_status);
CREATE INDEX IF NOT EXISTS applicants_completed_visits_idx ON public.applicants(completed_visits DESC);
