-- 1. Insurance record table
CREATE TABLE public.contractor_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  contractor_id uuid,
  provider text NOT NULL DEFAULT 'other',
  carrier_name text,
  policy_number text,
  per_occurrence_limit_cents bigint,
  aggregate_limit_cents bigint,
  effective_date date,
  expiration_date date,
  certificate_path text,
  certificate_mime text,
  additional_insured_status text NOT NULL DEFAULT 'unknown',
  verification_status text NOT NULL DEFAULT 'not_started',
  verified_at timestamptz,
  verified_by uuid,
  rejection_reason text,
  reminders_sent jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractor_insurance_provider_chk
    CHECK (provider IN ('thimble', 'other', 'unknown')),
  CONSTRAINT contractor_insurance_status_chk
    CHECK (verification_status IN ('not_started','pending_verification','verified','rejected','update_requested','expiring_soon','expired')),
  CONSTRAINT contractor_insurance_ai_chk
    CHECK (additional_insured_status IN ('unknown','not_listed','requested','listed','not_applicable'))
);

CREATE INDEX contractor_insurance_applicant_idx ON public.contractor_insurance(applicant_id);
CREATE INDEX contractor_insurance_contractor_idx ON public.contractor_insurance(contractor_id);
CREATE INDEX contractor_insurance_expiration_idx ON public.contractor_insurance(expiration_date);

GRANT SELECT, INSERT, UPDATE ON public.contractor_insurance TO authenticated;
GRANT ALL ON public.contractor_insurance TO service_role;

ALTER TABLE public.contractor_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors read own insurance"
  ON public.contractor_insurance FOR SELECT TO authenticated
  USING (contractor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Contractors insert own insurance"
  ON public.contractor_insurance FOR INSERT TO authenticated
  WITH CHECK (contractor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update insurance"
  ON public.contractor_insurance FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER contractor_insurance_updated_at
  BEFORE UPDATE ON public.contractor_insurance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Summary fields on applicants (additive only)
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS insurance_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS insurance_expires_at date;

-- 3. Server-side job eligibility helper: existing gates + insurance
CREATE OR REPLACE FUNCTION public.is_contractor_job_eligible(_contractor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.applicants a
    WHERE a.contractor_id = _contractor_id
      AND COALESCE(a.compliance_complete, false)
      AND a.stripe_connect_complete
      AND a.training_passed
      AND a.equipment_approved
      AND a.contracts_signed
      AND a.insurance_status = 'verified'
      AND a.insurance_expires_at IS NOT NULL
      AND a.insurance_expires_at >= CURRENT_DATE
  )
$$;

-- 4. Daily insurance expiry / reminder cron
SELECT cron.schedule(
  'insurance-expiry-check',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/insurance-expiry-check',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);