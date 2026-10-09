ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS lawn_measured_sqft integer;
COMMENT ON COLUMN public.subscriptions.lawn_measured_sqft IS 'Turf-only sq ft measured by Tidy from aerial imagery before conversion';

CREATE OR REPLACE FUNCTION public.reservations_mark_converted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text; _sqft int;
BEGIN
  IF NEW.status::text <> 'active' OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'active' THEN RETURN NEW; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;
  IF _email IS NULL THEN RETURN NEW; END IF;
  SELECT lawn_measured_sqft INTO _sqft FROM public.reservations
   WHERE lower(email) = _email AND status IN ('reserved','invited') AND lawn_measured_sqft IS NOT NULL ORDER BY created_at LIMIT 1;
  UPDATE public.reservations
     SET status = 'converted', converted_at = now(), user_id = NEW.user_id, subscription_id = NEW.id
   WHERE lower(email) = _email AND status IN ('reserved','invited');
  IF _sqft IS NOT NULL AND 'lawn' = ANY(NEW.services::text[]) THEN
    UPDATE public.subscriptions SET lawn_measured_sqft = _sqft WHERE id = NEW.id AND lawn_measured_sqft IS DISTINCT FROM _sqft;
  END IF;
  RETURN NEW;
END $$;