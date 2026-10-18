-- Fix hiring_seed_slots: generate_series over time isn't a function; use timestamp series.
CREATE OR REPLACE FUNCTION public.hiring_seed_slots() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; ts timestamp; n int := 0;
BEGIN
  -- Phone: Mon–Fri 6:00–8:30 PM ET and Sat 9:00–11:30 AM ET, every 30 min, next 5 days.
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 5, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
      FOR ts IN SELECT generate_series(d::timestamp + time '18:00', d::timestamp + time '20:00', '30 minutes'::interval) LOOP
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (ts AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'phone' AND s.starts_at = (ts AT TIME ZONE 'America/New_York'));
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    ELSIF extract(isodow FROM d) = 6 THEN
      FOR ts IN SELECT generate_series(d::timestamp + time '09:00', d::timestamp + time '11:00', '30 minutes'::interval) LOOP
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (ts AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'phone' AND s.starts_at = (ts AT TIME ZONE 'America/New_York'));
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  -- In-person: Saturdays 10:00 AM–3:00 PM ET, hourly, next 4 Saturdays.
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 28, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) = 6 THEN
      FOR ts IN SELECT generate_series(d::timestamp + time '10:00', d::timestamp + time '14:00', '1 hour'::interval) LOOP
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'in_person', (ts AT TIME ZONE 'America/New_York'), 60, 'Justin'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'in_person' AND s.starts_at = (ts AT TIME ZONE 'America/New_York'));
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN n;
END $$;

SELECT public.hiring_seed_slots();