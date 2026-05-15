-- COI columns
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS coi_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS coi_pdf_url text,
  ADD COLUMN IF NOT EXISTS coi_effective_date date,
  ADD COLUMN IF NOT EXISTS coi_expires_at date,
  ADD COLUMN IF NOT EXISTS coi_carrier_name text,
  ADD COLUMN IF NOT EXISTS coi_policy_number text,
  ADD COLUMN IF NOT EXISTS coi_review_status text NOT NULL DEFAULT 'pending_upload',
  ADD COLUMN IF NOT EXISTS coi_review_notes text;

-- Rate auto-calc trigger
CREATE OR REPLACE FUNCTION public.recalc_applicant_rates()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.contractor_cancel_rate := NEW.contractor_cancel_count::numeric / GREATEST(NEW.completed_visits + NEW.contractor_cancel_count, 1);
  NEW.complaint_rate := NEW.complaint_count::numeric / GREATEST(NEW.completed_visits, 1);
  NEW.photo_compliance_rate := NEW.photos_uploaded_count::numeric / GREATEST(NEW.photos_expected_count, 1);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_recalc_applicant_rates ON public.applicants;
CREATE TRIGGER trg_recalc_applicant_rates
BEFORE INSERT OR UPDATE OF completed_visits, contractor_cancel_count, complaint_count, photos_uploaded_count, photos_expected_count
ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.recalc_applicant_rates();

-- Tables
CREATE TABLE IF NOT EXISTS public.pro_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  jobber_visit_id text UNIQUE,
  customer_name text,
  service_type text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  customer_rating int,
  photos_count int NOT NULL DEFAULT 0,
  photos_expected int NOT NULL DEFAULT 6,
  status text NOT NULL DEFAULT 'scheduled',
  cancellation_reason text,
  amount_cents int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pro_visits_contractor ON public.pro_visits(contractor_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS public.google_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id text UNIQUE NOT NULL,
  reviewer_name text,
  rating int NOT NULL,
  review_text text,
  contractor_name_matched text,
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at timestamptz,
  bonus_paid_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_google_reviews_contractor ON public.google_reviews(contractor_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS public.complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL,
  severity text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  notes text,
  opened_by uuid
);
CREATE INDEX IF NOT EXISTS idx_complaints_contractor ON public.complaints(contractor_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source text NOT NULL,
  severity text NOT NULL,
  reason text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolution_notes text,
  opened_by uuid,
  resolved_by uuid
);
CREATE INDEX IF NOT EXISTS idx_escalations_contractor ON public.escalations(contractor_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.today_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  jobber_visit_id text UNIQUE,
  scheduled_at timestamptz NOT NULL,
  customer_name text,
  address_line1 text,
  city text,
  service_type text,
  estimated_duration_minutes int,
  distance_miles numeric(5,1),
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_today_visits_contractor ON public.today_visits(contractor_id, scheduled_at);

CREATE TABLE IF NOT EXISTS public.stripe_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_transfer_id text UNIQUE,
  amount_cents int NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  paid_at timestamptz,
  week_ending_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stripe_payouts_contractor ON public.stripe_payouts(contractor_id, week_ending_date DESC);

CREATE TABLE IF NOT EXISTS public.pro_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_contractor_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  referee_email text,
  referee_contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bonus_cents int NOT NULL DEFAULT 20000,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  bonus_paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pro_referrals_referrer ON public.pro_referrals(referrer_contractor_id);

CREATE TABLE IF NOT EXISTS public.jobber_webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  jobber_visit_id text,
  contractor_id uuid,
  payload jsonb NOT NULL,
  signature_valid boolean,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobber_webhook_log_contractor ON public.jobber_webhook_log(contractor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tier_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  contractor_id uuid,
  action text NOT NULL,
  from_tier text,
  to_tier text,
  reason text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.pro_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.today_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pro_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobber_webhook_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tier_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro_visits pro select own" ON public.pro_visits FOR SELECT TO authenticated USING (auth.uid() = contractor_id);
CREATE POLICY "pro_visits admin all" ON public.pro_visits FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "google_reviews pro select own" ON public.google_reviews FOR SELECT TO authenticated USING (auth.uid() = contractor_id);
CREATE POLICY "google_reviews admin all" ON public.google_reviews FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "complaints admin all" ON public.complaints FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "escalations admin all" ON public.escalations FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "today_visits pro select own" ON public.today_visits FOR SELECT TO authenticated USING (auth.uid() = contractor_id);
CREATE POLICY "today_visits admin all" ON public.today_visits FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "stripe_payouts pro select own" ON public.stripe_payouts FOR SELECT TO authenticated USING (auth.uid() = contractor_id);
CREATE POLICY "stripe_payouts admin all" ON public.stripe_payouts FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "pro_referrals pro select own" ON public.pro_referrals FOR SELECT TO authenticated USING (auth.uid() = referrer_contractor_id OR auth.uid() = referee_contractor_id);
CREATE POLICY "pro_referrals admin all" ON public.pro_referrals FOR ALL TO authenticated USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "jobber_webhook_log admin select" ON public.jobber_webhook_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "tier_audit_log admin select" ON public.tier_audit_log FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('contractor-coi-pdfs', 'contractor-coi-pdfs', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types, public = false;

DROP POLICY IF EXISTS "coi pro upload own" ON storage.objects;
CREATE POLICY "coi pro upload own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contractor-coi-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "coi pro select own" ON storage.objects;
CREATE POLICY "coi pro select own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contractor-coi-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "coi admin all" ON storage.objects;
CREATE POLICY "coi admin all" ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'contractor-coi-pdfs' AND has_role(auth.uid(),'admin'::app_role))
WITH CHECK (bucket_id = 'contractor-coi-pdfs' AND has_role(auth.uid(),'admin'::app_role));