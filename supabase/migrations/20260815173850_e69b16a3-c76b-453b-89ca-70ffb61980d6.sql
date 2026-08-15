-- Extra policy fields
ALTER TABLE public.contractor_insurance
  ADD COLUMN IF NOT EXISTS coverage_type text NOT NULL DEFAULT 'general_liability',
  ADD COLUMN IF NOT EXISTS verification_method text NOT NULL DEFAULT 'manual_admin',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS waived_reason text,
  ADD COLUMN IF NOT EXISTS waived_by uuid,
  ADD COLUMN IF NOT EXISTS waived_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_category text;

ALTER TABLE public.contractor_insurance
  DROP CONSTRAINT IF EXISTS contractor_insurance_status_chk;
ALTER TABLE public.contractor_insurance
  ADD CONSTRAINT contractor_insurance_status_chk
  CHECK (verification_status IN ('not_started','coverage_needed','pending_verification','verified','rejected','update_requested','expiring_soon','expired','waived'));

ALTER TABLE public.contractor_insurance
  DROP CONSTRAINT IF EXISTS contractor_insurance_provider_chk;

-- Provider registry (provider-agnostic architecture)
CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  provider_type text NOT NULL DEFAULT 'embedded_partner',
  integration_type text NOT NULL DEFAULT 'referral_link',
  enabled boolean NOT NULL DEFAULT false,
  is_preferred boolean NOT NULL DEFAULT false,
  referral_url text,
  embed_url text,
  embed_supported boolean NOT NULL DEFAULT false,
  supported_service_categories text[] NOT NULL DEFAULT ARRAY['cleaning','lawn','detailing'],
  display_order integer NOT NULL DEFAULT 0,
  disclosure_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT insurance_providers_integration_chk
    CHECK (integration_type IN ('referral_link','iframe_embed','api','manual'))
);

GRANT SELECT ON public.insurance_providers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.insurance_providers TO authenticated;
GRANT ALL ON public.insurance_providers TO service_role;
ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read enabled providers"
  ON public.insurance_providers FOR SELECT
  USING (enabled OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage providers"
  ON public.insurance_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER insurance_providers_updated_at
  BEFORE UPDATE ON public.insurance_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.insurance_providers
  (provider_key, display_name, provider_type, integration_type, enabled, is_preferred, display_order, disclosure_text)
VALUES
  ('thimble','Thimble','embedded_partner','iframe_embed', false, true, 1,
   'Insurance products are offered and administered by the applicable licensed insurance provider. TIDY is not the insurer and does not determine eligibility, premiums or claims.'),
  ('other','My own insurer','self_provided','manual', true, false, 2, null)
ON CONFLICT (provider_key) DO NOTHING;

-- Requirements per service category
CREATE TABLE IF NOT EXISTS public.insurance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category text NOT NULL UNIQUE,
  per_occurrence_limit_cents bigint NOT NULL DEFAULT 100000000,
  aggregate_limit_cents bigint NOT NULL DEFAULT 200000000,
  additional_insured_required boolean NOT NULL DEFAULT true,
  accepted_policy_types text[] NOT NULL DEFAULT ARRAY['general_liability'],
  reminder_days integer[] NOT NULL DEFAULT ARRAY[30,14,7],
  manual_verification_required boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.insurance_requirements TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.insurance_requirements TO authenticated;
GRANT ALL ON public.insurance_requirements TO service_role;
ALTER TABLE public.insurance_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read insurance requirements"
  ON public.insurance_requirements FOR SELECT USING (true);
CREATE POLICY "Admins manage insurance requirements"
  ON public.insurance_requirements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER insurance_requirements_updated_at
  BEFORE UPDATE ON public.insurance_requirements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.insurance_requirements (service_category) VALUES
  ('cleaning'), ('lawn'), ('detailing')
ON CONFLICT (service_category) DO NOTHING;

-- Admin audit trail
CREATE TABLE IF NOT EXISTS public.insurance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_id uuid REFERENCES public.contractor_insurance(id) ON DELETE SET NULL,
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  contractor_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  performed_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_audit_log_insurance_idx ON public.insurance_audit_log(insurance_id);

GRANT SELECT ON public.insurance_audit_log TO authenticated;
GRANT ALL ON public.insurance_audit_log TO service_role;
ALTER TABLE public.insurance_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read insurance audit log"
  ON public.insurance_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Eligibility: verified coverage, or an explicit admin waiver
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
      AND (
        a.insurance_status = 'waived'
        OR (
          a.insurance_status = 'verified'
          AND a.insurance_expires_at IS NOT NULL
          AND a.insurance_expires_at >= CURRENT_DATE
        )
      )
  )
$$;