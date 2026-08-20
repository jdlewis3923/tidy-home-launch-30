ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS referred_user_id uuid,
  ADD COLUMN IF NOT EXISTS referred_stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS referrer_stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS referral_code text,
  ADD COLUMN IF NOT EXISTS credited_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_user_id_key
  ON public.referrals (referred_user_id) WHERE referred_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS referrals_referred_customer_idx
  ON public.referrals (referred_stripe_customer_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id);