-- =========================================================================
-- PART A: compliance source columns + GENERATED compliance_complete
-- =========================================================================

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS coi_general_liability_status text,
  ADD COLUMN IF NOT EXISTS coi_auto_status text,
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS business_bank_account_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bond_status text,
  ADD COLUMN IF NOT EXISTS role text;

-- Backfill role from existing service field for any future rows that already exist.
UPDATE public.applicants
   SET role = CASE
     WHEN lower(coalesce(service,'')) LIKE '%lawn%' THEN 'lawn'
     WHEN lower(coalesce(service,'')) LIKE '%detail%' OR lower(coalesce(service,'')) LIKE '%car%' THEN 'detail'
     ELSE 'cleaning'
   END
 WHERE role IS NULL;

-- Drop manual flag, re-add as GENERATED STORED.
ALTER TABLE public.applicants DROP COLUMN compliance_complete;

ALTER TABLE public.applicants
  ADD COLUMN compliance_complete boolean
  GENERATED ALWAYS AS (
    coi_general_liability_status = 'received'
    AND coi_auto_status = 'received'
    AND ein IS NOT NULL
    AND business_bank_account_confirmed = true
    AND (role <> 'cleaning' OR bond_status = 'received')
  ) STORED;

-- =========================================================================
-- PART B: simplified current_stage values + CHECK constraint
-- =========================================================================

-- Migrate any existing values to the simplified set.
UPDATE public.applicants
   SET current_stage = CASE current_stage
     WHEN 'background_check_pending' THEN 'bg_check'
     WHEN 'background_check_review'  THEN 'bg_check'
     WHEN 'interview_pending'        THEN 'interview'
     WHEN 'demo_passed'              THEN 'oriented'
     ELSE current_stage
   END
 WHERE current_stage IN (
   'background_check_pending','background_check_review','interview_pending','demo_passed'
 );

-- Default to the simplified 'applied' literal.
ALTER TABLE public.applicants ALTER COLUMN current_stage SET DEFAULT 'applied';

-- Lock the column down.
ALTER TABLE public.applicants
  ADD CONSTRAINT applicants_status_valid CHECK (
    current_stage IN (
      'applied',
      'bg_check',
      'interview',
      'offer_sent',
      'contract_signed',
      'oriented',
      'active',
      'rejected'
    )
  );