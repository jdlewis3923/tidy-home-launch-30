-- Pure rule: items [{w, h}] in window order. Each starts when its window opens;
-- hours + 30 min travel must end before the next window opens; last ends by 6 PM.
CREATE OR REPLACE FUNCTION public.sched_seq_check(_items jsonb)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE r record; prev_end numeric := NULL;
BEGIN
  FOR r IN SELECT (x->>'h')::numeric h, t.start_h FROM jsonb_array_elements(_items) x
             CROSS JOIN LATERAL public.sched_window_times('cleaning', x->>'w') t ORDER BY t.start_h LOOP
    IF prev_end IS NOT NULL AND prev_end > r.start_h + 0.0001 THEN RETURN false; END IF;
    prev_end := r.start_h + r.h + 0.5;
    IF r.start_h + r.h > 18.0001 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.sched_cleaning_seq_ok(_pro uuid, _d date, _w text, _budget numeric, _excl_booking uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.sched_seq_check(coalesce(jsonb_agg(jsonb_build_object('w', i.w, 'h', i.h)), '[]'::jsonb)) FROM (
    SELECT v.window_key w, coalesce(v.budget_hours, 0) h FROM public.visits v
     WHERE v.assigned_pro_id = _pro AND v.visit_date = _d AND v.service::text = 'cleaning'
       AND v.status::text NOT IN ('canceled','skipped') AND v.booking_id IS DISTINCT FROM _excl_booking
    UNION ALL
    SELECT b.window_key, b.budget_hours FROM public.customer_bookings b JOIN public.pro_day_claims c ON c.id = b.claim_id
     WHERE c.pro_user_id = _pro AND b.status = 'active' AND b.service::text = 'cleaning' AND b.id IS DISTINCT FROM _excl_booking
       AND b.weekday = public.sched_dow(_d) AND _d >= b.first_visit_date
       AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.booking_id = b.id AND v.anchor_date = _d)
       AND _d IN (SELECT public.sched_dates(b.service, b.cadence, b.first_visit_date, _d, 1000))
    UNION ALL SELECT _w, _budget
  ) i
$$;