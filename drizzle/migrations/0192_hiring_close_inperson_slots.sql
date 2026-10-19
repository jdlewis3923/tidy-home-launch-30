DELETE FROM public.hiring_slots
 WHERE kind = 'in_person' AND status = 'open' AND applicant_id IS NULL AND starts_at >= now();

CREATE OR REPLACE FUNCTION public.hiring_seed_slots()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d date; ts timestamp; n int := 0;
BEGIN
  -- Phone only, Mon-Fri 6-8 PM ET. In-person slots are never auto-seeded; the owner adds them.
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 5, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
      FOR ts IN SELECT generate_series(d::timestamp + time '18:00', d::timestamp + time '20:00', '30 minutes'::interval) LOOP
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (ts AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind='phone' AND s.starts_at=(ts AT TIME ZONE 'America/New_York'));
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN n;
END $$;