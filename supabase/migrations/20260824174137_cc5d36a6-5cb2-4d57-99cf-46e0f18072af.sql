-- 1. Lead capture: allow the service role (edge functions) to write these tables.
GRANT ALL ON public.waitlist TO service_role;
GRANT ALL ON public.chatbot_leads TO service_role;
GRANT ALL ON public.support_requests TO service_role;
-- Admin reads from the client need SELECT for authenticated (RLS still restricts to admins).
GRANT SELECT ON public.waitlist TO authenticated;
GRANT SELECT ON public.chatbot_leads TO authenticated;
GRANT SELECT ON public.support_requests TO authenticated;
-- Deliberately NO anon/authenticated INSERT grant: writes go through edge functions.
DROP POLICY IF EXISTS "waitlist insert anyone" ON public.waitlist;
DROP POLICY IF EXISTS "Anyone can submit callback" ON public.chatbot_leads;

-- 2. Bundle discount canon on the catalog (10% for 2 services, 15% for 3).
UPDATE public.stripe_catalog SET bundle_discount_pct = 0 WHERE is_addon = true;
UPDATE public.stripe_catalog SET bundle_discount_pct = 10 WHERE is_addon = false;

-- 3. Remove fabricated reviews (FTC 16 CFR 465) and block bonuses on unreal rows.
DELETE FROM public.google_reviews;
ALTER TABLE public.google_reviews
  ADD CONSTRAINT google_reviews_bonus_requires_real_review
  CHECK (
    bonus_paid_at IS NULL
    OR (
      COALESCE(is_seed, false) = false
      AND review_id IS NOT NULL
      AND review_id NOT LIKE 'seed-review-%'
      AND review_id NOT LIKE 'TEST-SEED%'
      AND contractor_id IS NOT NULL
      AND posted_at IS NOT NULL
    )
  );

-- 6. Referral reward canon: $50, not $200.
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('referral_bonus_amount_cents', to_jsonb(5000), now())
ON CONFLICT (key) DO UPDATE SET value = to_jsonb(5000), updated_at = now();

-- 4 + 7. Durable record of Terms assent and SMS consent (timestamp, IP, exact wording).
CREATE TABLE IF NOT EXISTS public.user_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  kind text NOT NULL CHECK (kind IN ('terms', 'sms')),
  version text NOT NULL,
  wording text NOT NULL,
  granted boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_consents TO authenticated;
GRANT ALL ON public.user_consents TO service_role;
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_consents select own" ON public.user_consents;
CREATE POLICY "user_consents select own" ON public.user_consents
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 12. Brevo template ids the insurance cron reads (0 = disabled, logged, no crash).
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('brevo_template_insurance_expiring', to_jsonb(0), now())
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('brevo_template_insurance_expired', to_jsonb(0), now())
ON CONFLICT (key) DO NOTHING;

-- 14. is_contractor_job_eligible must not be anon-executable.
REVOKE ALL ON FUNCTION public.is_contractor_job_eligible(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_contractor_job_eligible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_contractor_job_eligible(uuid) TO authenticated, service_role;