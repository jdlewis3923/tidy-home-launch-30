CREATE TABLE public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','invited','converted','canceled')),
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  email text NOT NULL,
  phone text NOT NULL,
  sms_consent boolean NOT NULL DEFAULT false,
  services text[] NOT NULL,
  waitlist_services text[] NOT NULL DEFAULT '{}',
  quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_cents integer NOT NULL DEFAULT 0,
  street text NOT NULL,
  city text NOT NULL DEFAULT '',
  zip text NOT NULL,
  preferred_day text NOT NULL,
  preferred_time text NOT NULL CHECK (preferred_time IN ('morning','afternoon')),
  heard_from text NOT NULL CHECK (heard_from IN ('door_hanger','nextdoor','google','referral','other')),
  heard_other text,
  lang text NOT NULL DEFAULT 'en',
  invite_token text UNIQUE,
  invited_at timestamptz,
  assigned_day text,
  assigned_window text,
  assigned_pro_first_name text,
  converted_at timestamptz,
  user_id uuid,
  subscription_id uuid,
  is_test_row boolean NOT NULL DEFAULT false
);
CREATE INDEX reservations_created_idx ON public.reservations (created_at);
CREATE INDEX reservations_email_idx ON public.reservations (lower(email));

GRANT SELECT, UPDATE, DELETE ON public.reservations TO authenticated;
GRANT ALL ON public.reservations TO service_role;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read reservations" ON public.reservations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update reservations" ON public.reservations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete reservations" ON public.reservations FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public, honest founding counter: real rows only, nothing seeded.
CREATE OR REPLACE FUNCTION public.founding_spot_counts()
RETURNS TABLE(service text, reserved integer, cap integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.svc, COALESCE((
    SELECT count(*)::int FROM public.reservations r
    WHERE r.status <> 'canceled' AND s.svc = ANY(r.services) AND NOT (s.svc = ANY(r.waitlist_services))
  ), 0), 25
  FROM unnest(ARRAY['cleaning','lawn','detailing']) AS s(svc)
$$;
REVOKE ALL ON FUNCTION public.founding_spot_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founding_spot_counts() TO anon, authenticated, service_role;

-- A paid subscription closes the loop on an invited reservation (same email).
CREATE OR REPLACE FUNCTION public.reservations_mark_converted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text;
BEGIN
  IF NEW.status::text <> 'active' OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'active' THEN RETURN NEW; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;
  IF _email IS NULL THEN RETURN NEW; END IF;
  UPDATE public.reservations
     SET status = 'converted', converted_at = now(), user_id = NEW.user_id, subscription_id = NEW.id
   WHERE lower(email) = _email AND status IN ('reserved','invited');
  RETURN NEW;
END $$;
CREATE TRIGGER subscriptions_reservation_convert AFTER INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.reservations_mark_converted();