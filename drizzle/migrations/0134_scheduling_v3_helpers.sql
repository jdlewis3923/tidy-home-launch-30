CREATE OR REPLACE FUNCTION public.sched_launch_date() RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT value::date FROM public.sched_config WHERE key = 'launch_date'), DATE '2026-11-16')
$$;
CREATE OR REPLACE FUNCTION public.sched_today() RETURNS date LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/New_York')::date
$$;
CREATE OR REPLACE FUNCTION public.sched_dow(_d date) RETURNS int LANGUAGE sql IMMUTABLE AS $$ SELECT extract(isodow FROM _d)::int $$;
CREATE OR REPLACE FUNCTION public.sched_day_name(_w int) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[_w]
$$;
CREATE OR REPLACE FUNCTION public.sched_fmt(_d date) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT to_char(_d, 'FMDay FMDD FMMonth') $$;
CREATE OR REPLACE FUNCTION public.sched_svc_label(_s public.service_type) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s::text WHEN 'cleaning' THEN 'Cleaning' WHEN 'lawn' THEN 'Lawn' ELSE 'Car Care' END
$$;
CREATE OR REPLACE FUNCTION public.sched_windows(_s public.service_type) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s::text WHEN 'lawn' THEN ARRAY['day'] WHEN 'cleaning' THEN ARRAY['morning','midday'] ELSE ARRAY['morning','afternoon'] END
$$;
CREATE OR REPLACE FUNCTION public.sched_window_times(_s public.service_type, _key text, OUT start_h int, OUT end_h int, OUT label text)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _s::text = 'lawn' THEN start_h := 8; end_h := 18; label := 'Done by 6:00 PM';
  ELSIF _s::text = 'cleaning' AND _key = 'midday' THEN start_h := 12; end_h := 14; label := '12:00 PM – 2:00 PM';
  ELSIF _s::text = 'cleaning' THEN start_h := 8; end_h := 10; label := '8:00 AM – 10:00 AM';
  ELSIF _key = 'afternoon' THEN start_h := 12; end_h := 16; label := '12:00 PM – 4:00 PM';
  ELSE start_h := 8; end_h := 12; label := '8:00 AM – 12:00 PM';
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.sched_std_kind(_s public.service_type) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _s::text = 'detailing' THEN 'maintenance_wash' ELSE 'standard' END
$$;
CREATE OR REPLACE FUNCTION public.sched_budget(_s public.service_type, _size smallint, _kind text) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT hours FROM public.sched_budget_hours WHERE service = _s AND visit_kind = coalesce(_kind, public.sched_std_kind(_s))
       AND size_tier IN (coalesce(_size, 0), 0) ORDER BY size_tier DESC LIMIT 1),
    CASE _s::text WHEN 'cleaning' THEN 3 WHEN 'lawn' THEN 1 ELSE 1.5 END)
$$;
CREATE OR REPLACE FUNCTION public.sched_month_anchor(_first date, _k int) RETURNS date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ms date; sh int;
BEGIN
  ms := (_first + make_interval(months => _k))::date;
  sh := (public.sched_dow(_first) - public.sched_dow(ms) + 7) % 7;
  IF sh > 3 THEN sh := sh - 7; END IF;
  RETURN ms + sh;
END $$;
-- Standard visit dates for a booking, always on the booking's weekday.
CREATE OR REPLACE FUNCTION public.sched_dates(_s public.service_type, _cadence text, _first date, _until date, _max int)
RETURNS SETOF date LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE n int := 0; d date; k int := 0; ms date; o int; offs int[];
BEGIN
  IF _s::text <> 'detailing' AND _cadence IN ('weekly','biweekly') THEN
    d := _first;
    WHILE d <= _until AND n < _max LOOP
      RETURN NEXT d; n := n + 1;
      d := d + CASE WHEN _cadence = 'weekly' THEN 7 ELSE 14 END;
    END LOOP;
    RETURN;
  END IF;
  offs := CASE WHEN _s::text = 'detailing' THEN ARRAY[0,7,21] ELSE ARRAY[0] END;
  LOOP
    ms := public.sched_month_anchor(_first, k);
    EXIT WHEN ms > _until OR n >= _max OR k > 240;
    FOREACH o IN ARRAY offs LOOP
      d := ms + o;
      IF d <= _until AND n < _max THEN RETURN NEXT d; n := n + 1; END IF;
    END LOOP;
    k := k + 1;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sched_pro_active(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT public.pipeline_pro_assignable(a.id) FROM public.applicants a WHERE a.contractor_id = _uid ORDER BY a.created_at DESC LIMIT 1), false)
$$;
CREATE OR REPLACE FUNCTION public.sched_pro_first_name(_uid uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT a.first_name FROM public.applicants a WHERE a.contractor_id = _uid ORDER BY a.created_at DESC LIMIT 1), 'your Pro')
$$;
CREATE OR REPLACE FUNCTION public.sched_pro_services(_uid uuid) RETURNS public.service_type[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT s), '{}'::public.service_type[]) FROM (
    SELECT psa.service AS s FROM public.pro_service_assignments psa WHERE psa.contractor_id = _uid AND psa.active
    UNION
    SELECT (CASE a.service::text WHEN 'car_care' THEN 'detailing' ELSE a.service::text END)::public.service_type
      FROM public.applicants a WHERE a.contractor_id = _uid AND a.service::text IN ('car_care','detailing','cleaning','lawn')
  ) x WHERE s IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.sched_zips() RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT array_agg(z ORDER BY z) FROM (SELECT DISTINCT zip AS z FROM public.service_days UNION SELECT unnest(ARRAY['33156','33183','33186'])) x
$$;
CREATE OR REPLACE FUNCTION public.sched_claim_hours(_c public.pro_day_claims, _d date) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _c.hours_effective IS NOT NULL AND _d >= _c.hours_effective AND _c.pending_start IS NOT NULL
    THEN extract(epoch FROM (_c.pending_end - _c.pending_start)) / 3600.0
    ELSE extract(epoch FROM (_c.end_time - _c.start_time)) / 3600.0 END
$$;
CREATE OR REPLACE FUNCTION public.sched_claim_live_on(_c public.pro_day_claims, _d date) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _c.status IN ('active','dropping') AND (_c.drop_effective IS NULL OR _d < _c.drop_effective)
$$;
-- Claimed hours on a date (ignores call-offs/blackouts): used for "will a recurring booking fit".
CREATE OR REPLACE FUNCTION public.sched_weekday_hours(_pro uuid, _d date) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(public.sched_claim_hours(c, _d)), 0) FROM public.pro_day_claims c
  WHERE c.pro_user_id = _pro AND c.weekday = public.sched_dow(_d) AND public.sched_claim_live_on(c, _d)
$$;
-- date_capacity_hours = claimed hours that day x 0.80. Catch-up day counts as 8am-6pm. Days off are 0.
CREATE OR REPLACE FUNCTION public.sched_pro_cap(_pro uuid, _d date) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE h numeric;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pro_date_exceptions WHERE pro_user_id = _pro AND off_date = _d) THEN RETURN 0; END IF;
  h := public.sched_weekday_hours(_pro, _d);
  IF h = 0 AND EXISTS (SELECT 1 FROM public.pro_catchup_days WHERE pro_user_id = _pro AND weekday = public.sched_dow(_d)) THEN h := 10; END IF;
  RETURN h * 0.80;
END $$;
CREATE OR REPLACE FUNCTION public.sched_blocked(_s public.service_type, _zip text, _d date) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sched_blackouts b WHERE b.off_date = _d AND (b.service IS NULL OR b.service = _s) AND (b.zip IS NULL OR b.zip = _zip))
$$;
CREATE OR REPLACE FUNCTION public.sched_booked(_pro uuid, _d date, _excl uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(coalesce(v.budget_hours, 0)), 0) FROM public.visits v
  WHERE v.assigned_pro_id = _pro AND v.visit_date = _d AND v.status::text NOT IN ('canceled','skipped') AND v.id IS DISTINCT FROM _excl
$$;
-- Projected load: real visits plus booked recurring dates not generated yet.
CREATE OR REPLACE FUNCTION public.sched_load(_pro uuid, _d date, _excl_booking uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT coalesce(sum(coalesce(v.budget_hours, 0)), 0) FROM public.visits v
      WHERE v.assigned_pro_id = _pro AND v.visit_date = _d AND v.status::text NOT IN ('canceled','skipped')
        AND v.booking_id IS DISTINCT FROM _excl_booking)
  + (SELECT coalesce(sum(b.budget_hours), 0) FROM public.customer_bookings b JOIN public.pro_day_claims c ON c.id = b.claim_id
      WHERE c.pro_user_id = _pro AND b.status = 'active' AND b.id IS DISTINCT FROM _excl_booking
        AND b.weekday = public.sched_dow(_d) AND _d >= b.first_visit_date
        AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.booking_id = b.id AND v.anchor_date = _d)
        AND _d IN (SELECT public.sched_dates(b.service, b.cadence, b.first_visit_date, _d, 1000)))
$$;
CREATE OR REPLACE FUNCTION public.sched_window_taken(_pro uuid, _d date, _s public.service_type, _w text, _excl_booking uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _s::text = 'cleaning' AND (
    EXISTS (SELECT 1 FROM public.visits v WHERE v.assigned_pro_id = _pro AND v.visit_date = _d AND v.service::text = 'cleaning'
              AND v.window_key = _w AND v.status::text NOT IN ('canceled','skipped') AND v.booking_id IS DISTINCT FROM _excl_booking)
    OR EXISTS (SELECT 1 FROM public.customer_bookings b JOIN public.pro_day_claims c ON c.id = b.claim_id
              WHERE c.pro_user_id = _pro AND b.status = 'active' AND b.service::text = 'cleaning' AND b.window_key = _w
                AND b.id IS DISTINCT FROM _excl_booking AND b.weekday = public.sched_dow(_d) AND _d >= b.first_visit_date
                AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.booking_id = b.id AND v.anchor_date = _d)
                AND _d IN (SELECT public.sched_dates(b.service, b.cadence, b.first_visit_date, _d, 1000))))
$$;
-- A recurring booking fits only if its next 8 occurrences fit.
CREATE OR REPLACE FUNCTION public.sched_slot_fits(_claim uuid, _cadence text, _first date, _w text, _budget numeric, _excl_booking uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims; d date;
BEGIN
  SELECT * INTO c FROM public.pro_day_claims WHERE id = _claim;
  IF NOT FOUND THEN RETURN false; END IF;
  FOR d IN SELECT public.sched_dates(c.service, _cadence, _first, _first + 730, 8) LOOP
    IF NOT public.sched_claim_live_on(c, d) THEN RETURN false; END IF;
    IF public.sched_load(c.pro_user_id, d, _excl_booking) + _budget > public.sched_weekday_hours(c.pro_user_id, d) * 0.80 + 0.0001 THEN RETURN false; END IF;
    IF public.sched_window_taken(c.pro_user_id, d, c.service, _w, _excl_booking) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.sched_first_date(_claim uuid, _cadence text, _w text, _budget numeric, _excl_booking uuid)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims; st date; d date; i int;
BEGIN
  SELECT * INTO c FROM public.pro_day_claims WHERE id = _claim;
  IF NOT FOUND THEN RETURN NULL; END IF;
  st := greatest(public.sched_launch_date(), public.sched_today() + 2);
  d := st + ((c.weekday - public.sched_dow(st) + 7) % 7);
  FOR i IN 0..11 LOOP
    IF NOT public.sched_blocked(c.service, c.zip, d) AND public.sched_slot_fits(_claim, _cadence, d, _w, _budget, _excl_booking) THEN RETURN d; END IF;
    d := d + 7;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.sched_alert(_type text, _title text, _body text, _level text, _url text, _dedupe text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_alerts (alert_type, title, body, level, category, action_label, action_url, dedupe_key)
  VALUES (_type, _title, _body, _level, 'scheduling', 'Open', _url, _dedupe) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.sched_once(_key text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sched_notice_log(key) VALUES (_key) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
CREATE OR REPLACE FUNCTION public.sched_pro_notice(_pro uuid, _kind text, _title text, _body text, _url text, _dedupe text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _dedupe IS NOT NULL AND NOT public.sched_once('pro:' || _dedupe) THEN RETURN; END IF;
  INSERT INTO public.pro_notifications (contractor_id, kind, title, body, url) VALUES (_pro, _kind, _title, _body, _url);
END $$;
-- Customer notice: email via member_notifications; text parked in sms_outbox, which only
-- releases inside the 08:00–18:00 ET Mon–Sat window (existing quiet-hours guard).
CREATE OR REPLACE FUNCTION public.sched_customer_notice(_user uuid, _kind text, _title text, _body text, _dedupe text, _visit uuid, _sms text, _expires timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; digits text; e164 text;
BEGIN
  BEGIN
    PERFORM public.notify_member(_user, _kind, _title, _body, _dedupe, _visit, NULL);
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  IF _sms IS NULL THEN RETURN; END IF;
  SELECT phone, sms_opt_in, sms_opt_out INTO p FROM public.profiles WHERE user_id = _user;
  IF NOT FOUND OR p.phone IS NULL OR coalesce(p.sms_opt_in::text, 'false') <> 'true'
     OR (p.sms_opt_out IS NOT NULL AND p.sms_opt_out::text <> 'false') THEN RETURN; END IF;
  digits := regexp_replace(p.phone, '[^0-9]', '', 'g');
  e164 := CASE WHEN length(digits) = 10 THEN '+1' || digits WHEN length(digits) = 11 AND left(digits,1) = '1' THEN '+' || digits ELSE NULL END;
  IF e164 IS NULL THEN RETURN; END IF;
  INSERT INTO public.sms_outbox (to_phone_e164, body, idempotency_key, template_name, triggered_by, status, queued_reason, release_after, expires_at)
  VALUES (e164, _sms, 'sched-' || _dedupe, 'schedule_' || _kind, 'scheduling', 'queued', 'scheduling', now(), _expires)
  ON CONFLICT DO NOTHING;
END $$;

DO $$ DECLARE f text; BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'sched\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;