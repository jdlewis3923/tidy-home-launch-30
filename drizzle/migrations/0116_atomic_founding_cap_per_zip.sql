CREATE OR REPLACE FUNCTION public.assign_founding_reservation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_homes integer;
  v_already boolean;
BEGIN
  IF NEW.status = 'canceled' OR coalesce(cardinality(NEW.waitlist_services), 0) > 0 THEN
    NEW.founding := false;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('founding_zip:' || left(trim(NEW.zip), 5)));

  SELECT EXISTS (
    SELECT 1
    FROM public.reservations r
    WHERE r.status <> 'canceled'
      AND coalesce(cardinality(r.waitlist_services), 0) = 0
      AND public.founding_address_key(r.street, r.zip) = public.founding_address_key(NEW.street, NEW.zip)
  ) INTO v_already;

  SELECT count(DISTINCT public.founding_address_key(r.street, r.zip))::integer
  INTO v_homes
  FROM public.reservations r
  WHERE r.status <> 'canceled'
    AND left(r.zip, 5) = left(NEW.zip, 5)
    AND coalesce(cardinality(r.waitlist_services), 0) = 0
    AND r.founding IS TRUE;

  NEW.founding := v_already OR coalesce(v_homes, 0) < 25;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER reservations_assign_founding_status
BEFORE INSERT ON public.reservations
FOR EACH ROW
EXECUTE FUNCTION public.assign_founding_reservation_status();