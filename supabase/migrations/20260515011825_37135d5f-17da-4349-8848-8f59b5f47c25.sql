CREATE TABLE IF NOT EXISTS public.tier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL,
  applicant_id uuid,
  offer_type text NOT NULL DEFAULT 'tier_2_pro_partner',
  status text NOT NULL DEFAULT 'sent',
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  brevo_template_id integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tier_offers_contractor ON public.tier_offers(contractor_id);
ALTER TABLE public.tier_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tier_offers admin all" ON public.tier_offers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tier_offers pro select own" ON public.tier_offers FOR SELECT TO authenticated USING (auth.uid() = contractor_id);