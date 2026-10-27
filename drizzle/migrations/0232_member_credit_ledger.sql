-- Member credit ledger: every promised credit (skip, weather, first lockout,
-- goodwill) is a row here first, then applied to the member's Stripe customer
-- balance so it comes off the next bill automatically.
CREATE TABLE public.member_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  visit_id uuid,
  kind text NOT NULL CHECK (kind IN ('skip_credit','weather_credit','lockout_courtesy','goodwill')),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','void')),
  stripe_balance_transaction_id text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
GRANT SELECT ON public.member_credits TO authenticated;
GRANT ALL ON public.member_credits TO service_role;
ALTER TABLE public.member_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read own credits" ON public.member_credits FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read all credits" ON public.member_credits FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Server-side credit issuance (edge functions and triggers only).
CREATE OR REPLACE FUNCTION public.issue_member_credit(_user uuid, _subscription uuid, _visit uuid, _kind text, _amount_cents int, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RETURN NULL; END IF;
  -- One credit per visit per kind, ever.
  IF _visit IS NOT NULL AND EXISTS (SELECT 1 FROM public.member_credits WHERE visit_id = _visit AND kind = _kind AND status <> 'void') THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.member_credits (user_id, subscription_id, visit_id, kind, amount_cents, note)
  VALUES (_user, _subscription, _visit, _kind, _amount_cents, left(coalesce(_note,''), 500))
  RETURNING id INTO cid;
  RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.issue_member_credit(uuid, uuid, uuid, text, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_member_credit(uuid, uuid, uuid, text, int, text) TO service_role;

-- Customer per-visit price for a visit, from the subscription's plan snapshot.
CREATE OR REPLACE FUNCTION public.visit_customer_price_cents(_visit uuid) RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (pl->>'per_visit_cents')::int
  FROM public.visits v
  JOIN public.subscriptions s ON s.id = v.subscription_id
  CROSS JOIN LATERAL jsonb_array_elements(s.plan_lines) pl
  WHERE v.id = _visit AND pl->>'service' = v.service::text
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.visit_customer_price_cents(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_customer_price_cents(uuid) TO service_role;

-- First lockout each calendar year is on us: credit the visit and tell the
-- member. Later lockouts are charged (no credit), still with a notice.
CREATE OR REPLACE FUNCTION public.visits_lockout_courtesy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE prior int; price int; cid uuid;
BEGIN
  IF NEW.paid_in_full_reason IS DISTINCT FROM 'customer_no_access' THEN RETURN NEW; END IF;
  IF OLD.paid_in_full_reason IS NOT DISTINCT FROM NEW.paid_in_full_reason THEN RETURN NEW; END IF;
  SELECT count(*) INTO prior FROM public.visits
  WHERE user_id = NEW.user_id AND id <> NEW.id AND paid_in_full_reason = 'customer_no_access'
    AND visit_date >= date_trunc('year', (now() AT TIME ZONE 'America/New_York'))::date;
  IF prior = 0 THEN
    price := public.visit_customer_price_cents(NEW.id);
    cid := public.issue_member_credit(NEW.user_id, NEW.subscription_id, NEW.id, 'lockout_courtesy', price, 'First lockout of the year — on us');
    INSERT INTO public.member_notifications (user_id, kind, title, body, dedupe_key, related_visit_id)
    VALUES (NEW.user_id, 'lockout_courtesy', 'This one is on us',
      'We could not get in today, so nothing worked — but your first lockout each year is free. We have credited this visit and we will find a new time with you.',
      'lockout-courtesy-' || NEW.id, NEW.id);
  ELSE
    INSERT INTO public.member_notifications (user_id, kind, title, body, dedupe_key, related_visit_id)
    VALUES (NEW.user_id, 'lockout_charged', 'We could not get in',
      'Your Pro arrived but could not get in, so the visit is billed as usual — the first one each year is the free one. Reply and we will sort out entry so it does not happen again.',
      'lockout-charged-' || NEW.id, NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_lockout_courtesy AFTER UPDATE OF paid_in_full_reason ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.visits_lockout_courtesy();