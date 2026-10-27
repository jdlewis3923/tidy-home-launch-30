-- Annual (prepaid year) billing lifecycle: period tracking on subscriptions
-- and a refund ledger so a canceled prepaid year is refunded exactly once.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS annual_notice_sent_for date;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_period_check CHECK (billing_period IN ('monthly','yearly'));

CREATE TABLE public.annual_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  current_period_start timestamptz,
  stripe_refund_id text,
  paid_cents integer NOT NULL,
  months_used integer NOT NULL,
  amount_cents integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX annual_refunds_one_per_period ON public.annual_refunds (subscription_id, coalesce(current_period_start, 'epoch'::timestamptz));
GRANT SELECT ON public.annual_refunds TO authenticated;
GRANT ALL ON public.annual_refunds TO service_role;
ALTER TABLE public.annual_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY annual_refunds_member_read ON public.annual_refunds FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY annual_refunds_admin_read ON public.annual_refunds FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));