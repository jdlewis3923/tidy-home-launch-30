
-- 1) visits.crew_name
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS crew_name text;

-- 2) subscriptions.card_brand + card_last4
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_brand text;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_last4 text;

-- 3) profiles.referral_code (unique, nullable)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_key
  ON public.profiles (referral_code)
  WHERE referral_code IS NOT NULL;

-- Helper: generate TIDY-XXXXX (5 alphanumeric uppercase, no ambiguous chars)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
  attempts int := 0;
  exists_row int;
BEGIN
  LOOP
    candidate := 'TIDY-';
    FOR i IN 1..5 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    SELECT 1 INTO exists_row FROM public.profiles WHERE referral_code = candidate LIMIT 1;
    IF exists_row IS NULL THEN
      RETURN candidate;
    END IF;
    attempts := attempts + 1;
    IF attempts > 12 THEN
      RAISE EXCEPTION 'could not generate unique referral_code';
    END IF;
  END LOOP;
END;
$$;

-- Backfill existing profiles missing a code
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

-- Update handle_new_user to seed referral_code on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, phone, referral_code)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'phone',
    public.generate_referral_code()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4) referrals tracking table
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  referee_email text,
  status text NOT NULL DEFAULT 'pending', -- pending | converted | credited
  credit_cents integer NOT NULL DEFAULT 0,
  stripe_credit_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_user_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referrals select own"
  ON public.referrals FOR SELECT
  USING (auth.uid() = referrer_user_id);

CREATE POLICY "referrals admin select all"
  ON public.referrals FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 5) support_requests table
CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL, -- reschedule | note | access | other
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open', -- open | handled | dismissed
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_requests_user_idx ON public.support_requests (user_id);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "support_requests insert own"
  ON public.support_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "support_requests select own"
  ON public.support_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "support_requests admin select all"
  ON public.support_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER support_requests_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
