CREATE OR REPLACE FUNCTION public.sched_windows(_s service_type)
 RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s::text WHEN 'lawn' THEN ARRAY['day'] WHEN 'cleaning' THEN ARRAY['morning','midday','afternoon'] ELSE ARRAY['morning','afternoon'] END
$$;

CREATE OR REPLACE FUNCTION public.sched_window_times(_s service_type, _key text, OUT start_h integer, OUT end_h integer, OUT label text)
 RETURNS record LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _s::text = 'lawn' THEN start_h := 8; end_h := 18; label := 'Done by 6:00 PM';
  ELSIF _s::text = 'cleaning' AND _key = 'midday' THEN start_h := 11; end_h := 13; label := '11:00 AM – 1:00 PM';
  ELSIF _s::text = 'cleaning' AND _key = 'afternoon' THEN start_h := 14; end_h := 16; label := '2:00 PM – 4:00 PM';
  ELSIF _s::text = 'cleaning' THEN start_h := 8; end_h := 10; label := '8:00 AM – 10:00 AM';
  ELSIF _key = 'afternoon' THEN start_h := 12; end_h := 16; label := '12:00 PM – 4:00 PM';
  ELSE start_h := 8; end_h := 12; label := '8:00 AM – 12:00 PM';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sched_cleaning_seq_ok(_pro uuid, _d date, _w text, _budget numeric, _excl_booking uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; prev_end numeric := NULL;
BEGIN
  FOR r IN
    WITH items AS (
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
    )
    SELECT i.w, i.h, t.start_h FROM items i CROSS JOIN LATERAL public.sched_window_times('cleaning', i.w) t ORDER BY t.start_h
  LOOP
    IF prev_end IS NOT NULL AND prev_end > r.start_h + 0.0001 THEN RETURN false; END IF;
    prev_end := r.start_h + r.h + 0.5;
    IF r.start_h + r.h > 18.0001 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;

INSERT INTO public.sched_config (key, value) VALUES ('custom_hours_enabled', 'false') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sched_full_day(_s service_type, OUT start_t time, OUT end_t time)
 RETURNS record LANGUAGE sql IMMUTABLE AS $$
  SELECT time '08:00', CASE WHEN _s::text = 'detailing' THEN time '16:00' ELSE time '18:00' END
$$;

CREATE OR REPLACE FUNCTION public.sched_active_pro_count(_s service_type)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(DISTINCT pro_user_id)::int FROM public.pro_day_claims WHERE service = _s AND status IN ('active','dropping')
$$;

CREATE OR REPLACE FUNCTION public.sched_custom_hours_allowed(_s service_type)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce((SELECT value FROM public.sched_config WHERE key = 'custom_hours_enabled'), 'false') = 'true'
     AND public.sched_active_pro_count(_s) >= 2
$$;

CREATE OR REPLACE FUNCTION public.pro_custom_hours_state()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.service_type; out jsonb := '{}'::jsonb; f record;
BEGIN
  FOREACH s IN ARRAY ARRAY['cleaning','lawn','detailing']::public.service_type[] LOOP
    SELECT * INTO f FROM public.sched_full_day(s);
    out := out || jsonb_build_object(s::text, jsonb_build_object('allowed', public.sched_custom_hours_allowed(s),
      'start', to_char(f.start_t, 'HH24:MI'), 'end', to_char(f.end_t, 'HH24:MI'), 'active_pros', public.sched_active_pro_count(s)));
  END LOOP;
  RETURN out || jsonb_build_object('switch_on', coalesce((SELECT value FROM public.sched_config WHERE key = 'custom_hours_enabled'), 'false') = 'true');
END $$;
GRANT EXECUTE ON FUNCTION public.pro_custom_hours_state() TO authenticated;

CREATE TABLE IF NOT EXISTS public.sched_first_right (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service public.service_type NOT NULL,
  zip text NOT NULL,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  pro_user_id uuid NOT NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours',
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','accepted','declined','expired')),
  responded_at timestamptz,
  UNIQUE (service, zip, weekday, pro_user_id)
);
GRANT SELECT ON public.sched_first_right TO authenticated;
GRANT ALL ON public.sched_first_right TO service_role;
ALTER TABLE public.sched_first_right ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pros read their own first-right offers" ON public.sched_first_right FOR SELECT TO authenticated
  USING (pro_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.sched_first_right_open(_s service_type, _zip text, _wd int)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT pro_user_id FROM public.sched_first_right WHERE service = _s AND zip = _zip AND weekday = _wd AND status = 'offered' AND expires_at > now() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.sched_service_day_first_right() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pro uuid;
BEGIN
  IF NOT NEW.active OR (TG_OP = 'UPDATE' AND OLD.active) THEN RETURN NEW; END IF;
  SELECT c.pro_user_id INTO pro FROM public.pro_day_claims c WHERE c.service = NEW.service AND c.zip = NEW.zip AND c.status IN ('active','dropping')
   GROUP BY c.pro_user_id ORDER BY count(*) DESC, min(c.created_at) LIMIT 1;
  IF pro IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.sched_first_right (service, zip, weekday, pro_user_id) VALUES (NEW.service, NEW.zip, NEW.weekday, pro)
  ON CONFLICT (service, zip, weekday, pro_user_id) DO UPDATE SET status = 'offered', offered_at = now(), expires_at = now() + interval '72 hours', responded_at = NULL;
  PERFORM public.sched_pro_notice(pro, 'first_right', format('First right: %s in %s', public.sched_day_name(NEW.weekday), NEW.zip),
    format('We''re opening %s in %s. It''s yours first — claim it within 72 hours or it goes to another Pro.', public.sched_day_name(NEW.weekday), NEW.zip),
    '/pro/schedule', 'first-right-' || NEW.id || '-' || pro);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_service_day_first_right ON public.service_days;
CREATE TRIGGER trg_service_day_first_right AFTER INSERT OR UPDATE OF active ON public.service_days
  FOR EACH ROW EXECUTE FUNCTION public.sched_service_day_first_right();

CREATE OR REPLACE FUNCTION public.pro_decline_first_right(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := public.sched_me_pro(); r public.sched_first_right;
BEGIN
  UPDATE public.sched_first_right SET status = 'declined', responded_at = now() WHERE id = _id AND pro_user_id = uid AND status = 'offered' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  PERFORM public.sched_alert('schedule_first_right_declined', format('%s passed on %s in %s', public.sched_pro_first_name(uid), public.sched_day_name(r.weekday), r.zip),
    'The day now goes to the hire spec / other Pros.', 'action', '/admin/calendar', 'fr-declined-' || r.id);
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.pro_decline_first_right(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pro_claim_day(_service service_type, _zip text, _weekday integer, _start text, _end text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE uid uuid := public.sched_me_pro(); cu int; st time; en time; act boolean; c public.pro_day_claims; f record; fr uuid;
BEGIN
  IF _weekday NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  IF NOT (_service = ANY(public.sched_pro_services(uid))) THEN RAISE EXCEPTION 'not_your_service'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_days WHERE service = _service AND zip = _zip AND weekday = _weekday AND active AND close_effective IS NULL) THEN RAISE EXCEPTION 'not_served'; END IF;
  SELECT weekday INTO cu FROM public.pro_catchup_days WHERE pro_user_id = uid;
  IF cu IS NULL THEN RAISE EXCEPTION 'catchup_required'; END IF;
  IF cu = _weekday THEN RAISE EXCEPTION 'catchup_conflict'; END IF;
  st := _start::time; en := _end::time;
  IF st < time '08:00' OR en > time '18:00' OR en - st < interval '4 hours' THEN RAISE EXCEPTION 'hours_invalid'; END IF;
  IF NOT public.sched_custom_hours_allowed(_service) THEN
    SELECT * INTO f FROM public.sched_full_day(_service);
    IF st <> f.start_t OR en <> f.end_t THEN RAISE EXCEPTION 'full_day_required'; END IF;
  END IF;
  fr := public.sched_first_right_open(_service, _zip, _weekday);
  IF fr IS NOT NULL AND fr <> uid THEN RAISE EXCEPTION 'first_right_held'; END IF;
  act := public.sched_pro_active(uid);
  BEGIN
    INSERT INTO public.pro_day_claims (pro_user_id, service, zip, weekday, start_time, end_time, status, activated_at)
    VALUES (uid, _service, _zip, _weekday, st, en, CASE WHEN act THEN 'active' ELSE 'pending' END, CASE WHEN act THEN now() END)
    RETURNING * INTO c;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'taken';
  END;
  UPDATE public.sched_first_right SET status = 'accepted', responded_at = now() WHERE service = _service AND zip = _zip AND weekday = _weekday AND pro_user_id = uid AND status = 'offered';
  IF act THEN
    PERFORM public.sched_waitlist_offer(_service, _zip);
  ELSE
    PERFORM public.sched_alert('schedule_pending_claim', format('Pending claim: %s %s in %s', public.sched_svc_label(_service), public.sched_day_name(_weekday), _zip),
      format('%s claimed it but is not active yet. It goes live automatically at stage 7.', public.sched_pro_first_name(uid)), 'action', '/admin/calendar', 'pending-' || c.id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'claim_id', c.id, 'status', c.status);
END $function$;

CREATE OR REPLACE FUNCTION public.sched_slot_fits(_claim uuid, _cadence text, _first date, _w text, _budget numeric, _excl_booking uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.pro_day_claims; d date; t record;
BEGIN
  SELECT * INTO c FROM public.pro_day_claims WHERE id = _claim;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO t FROM public.sched_window_times(c.service, _w);
  IF c.service::text <> 'lawn' AND (make_time(t.start_h, 0, 0) < c.start_time OR make_time(t.end_h, 0, 0) > c.end_time) THEN RETURN false; END IF;
  FOR d IN SELECT public.sched_dates(c.service, _cadence, _first, _first + 730, 8) LOOP
    IF NOT public.sched_claim_live_on(c, d) THEN RETURN false; END IF;
    IF public.sched_load(c.pro_user_id, d, _excl_booking) + _budget > public.sched_weekday_hours(c.pro_user_id, d) * 0.80 + 0.0001 THEN RETURN false; END IF;
    IF public.sched_window_taken(c.pro_user_id, d, c.service, _w, _excl_booking) THEN RETURN false; END IF;
    IF c.service::text = 'cleaning' AND NOT public.sched_cleaning_seq_ok(c.pro_user_id, d, _w, _budget, _excl_booking) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.sched_booking_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pro uuid;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.service::text = 'cleaning' THEN
    SELECT pro_user_id INTO pro FROM public.pro_day_claims WHERE id = NEW.claim_id;
    IF NOT (NEW.window_key = ANY(public.sched_windows(NEW.service))) THEN RAISE EXCEPTION 'invalid_window'; END IF;
    IF pro IS NOT NULL AND NOT public.sched_cleaning_seq_ok(pro, NEW.first_visit_date, NEW.window_key, NEW.budget_hours, NEW.id) THEN
      RAISE EXCEPTION 'window_sequence_conflict';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.service::text = 'lawn'
     AND coalesce(current_setting('tidy.lawn_assign', true), '') <> 'on'
     AND NOT EXISTS (SELECT 1 FROM public.customer_bookings x WHERE x.user_id = NEW.user_id AND x.service = NEW.service AND x.id <> NEW.id)
     AND auth.uid() = NEW.user_id THEN
    RAISE EXCEPTION 'lawn_day_assigned';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sched_booking_guard ON public.customer_bookings;
CREATE TRIGGER trg_sched_booking_guard BEFORE INSERT OR UPDATE OF window_key, claim_id, status ON public.customer_bookings
  FOR EACH ROW EXECUTE FUNCTION public.sched_booking_guard();

CREATE OR REPLACE FUNCTION public.sched_street_key(_addr text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(regexp_replace(regexp_replace(regexp_replace(lower(coalesce(_addr, '')),
    '\s*(#|apt|unit|ste|suite)\s*\S*$', ''), '^\s*\d+[a-z]?\s+', ''), '[^a-z0-9]+', ' ', 'g')), '')
$$;

CREATE OR REPLACE FUNCTION public.sched_lawn_day_pick(_zip text, _street text, _weekdays int[], _sim jsonb DEFAULT '[]'::jsonb)
 RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH k AS (SELECT public.sched_street_key(_street) key),
  existing AS (
    SELECT b.weekday, public.sched_street_key(p.address_line1) sk, b.budget_hours h
      FROM public.customer_bookings b LEFT JOIN public.profiles p ON p.user_id = b.user_id
     WHERE b.service::text = 'lawn' AND b.zip = _zip AND b.status = 'active'
    UNION ALL
    SELECT (x->>'weekday')::int, public.sched_street_key(x->>'street'), coalesce((x->>'hours')::numeric, 0.9) FROM jsonb_array_elements(_sim) x
  )
  SELECT wd FROM unnest(_weekdays) wd
   ORDER BY (SELECT count(*) FROM existing e, k WHERE e.weekday = wd AND k.key IS NOT NULL AND e.sk = k.key) DESC,
            (SELECT coalesce(sum(e.h), 0) FROM existing e WHERE e.weekday = wd) ASC, wd ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.customer_assign_lawn_day()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); o jsonb; opt jsonb; wds int[] := '{}'; wd int; street text; r jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  o := public.sched_options(uid, 'lawn');
  IF o ? 'error' THEN RAISE EXCEPTION '%', o->>'error'; END IF;
  IF o->'booking' IS NOT NULL AND o->'booking' <> 'null'::jsonb THEN RETURN jsonb_build_object('ok', true, 'weekday', (o->'booking'->>'weekday')::int, 'already', true); END IF;
  FOR opt IN SELECT * FROM jsonb_array_elements(o->'options') LOOP
    IF NOT (opt->>'full')::boolean THEN wds := wds || (opt->>'weekday')::int; END IF;
  END LOOP;
  IF cardinality(wds) = 0 THEN
    PERFORM public.customer_join_waitlist('lawn', NULL);
    RETURN jsonb_build_object('ok', true, 'waitlisted', true);
  END IF;
  SELECT address_line1 INTO street FROM public.profiles WHERE user_id = uid;
  IF street IS NULL THEN SELECT r2.street INTO street FROM public.reservations r2 WHERE r2.user_id = uid ORDER BY r2.created_at DESC LIMIT 1; END IF;
  wd := public.sched_lawn_day_pick(o->>'zip', street, wds);
  PERFORM set_config('tidy.lawn_assign', 'on', true);
  r := public.customer_book_day('lawn', wd, 'day', '{}'::jsonb);
  PERFORM set_config('tidy.lawn_assign', '', true);
  RETURN r || jsonb_build_object('weekday', wd);
END $$;
GRANT EXECUTE ON FUNCTION public.customer_assign_lawn_day() TO authenticated;

ALTER TABLE public.pro_date_exceptions DROP CONSTRAINT IF EXISTS pro_date_exceptions_kind_check;
ALTER TABLE public.pro_date_exceptions ADD CONSTRAINT pro_date_exceptions_kind_check CHECK (kind = ANY (ARRAY['call_off','time_off','busy']));

CREATE OR REPLACE FUNCTION public.pro_set_catchup_busy(_date date, _busy boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := public.sched_me_pro(); cu int;
BEGIN
  SELECT weekday INTO cu FROM public.pro_catchup_days WHERE pro_user_id = uid;
  IF cu IS NULL OR public.sched_dow(_date) <> cu THEN RAISE EXCEPTION 'not_catchup_day'; END IF;
  IF _date <= public.sched_today() THEN RAISE EXCEPTION 'past_date'; END IF;
  IF _busy THEN
    IF EXISTS (SELECT 1 FROM public.visits WHERE assigned_pro_id = uid AND visit_date = _date AND status::text = 'scheduled') THEN RAISE EXCEPTION 'visits_already_moved_here'; END IF;
    INSERT INTO public.pro_date_exceptions (pro_user_id, off_date, kind, note) VALUES (uid, _date, 'busy', 'Own work on catch-up day')
    ON CONFLICT (pro_user_id, off_date) DO NOTHING;
  ELSE
    DELETE FROM public.pro_date_exceptions WHERE pro_user_id = uid AND off_date = _date AND kind = 'busy';
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.pro_set_catchup_busy(date, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.sched_find_slot(_pro uuid, _s service_type, _zip text, _d date, _w text, _budget numeric, _excl uuid, _sub uuid DEFAULT NULL::uuid, OUT slot_date date, OUT slot_window text)
 RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE wk date; cands date[] := '{}'; cu int; wd int; c date; ws text[]; w text; today date := public.sched_today(); t record;
BEGIN
  wk := _d - (public.sched_dow(_d) - 1);
  SELECT weekday INTO cu FROM public.pro_catchup_days WHERE pro_user_id = _pro;
  IF cu IS NOT NULL THEN cands := cands || (wk + (cu - 1)); END IF;
  FOR wd IN SELECT DISTINCT cl.weekday FROM public.pro_day_claims cl WHERE cl.pro_user_id = _pro AND cl.service = _s AND cl.zip = _zip
            AND cl.status IN ('active','dropping') AND cl.weekday <> public.sched_dow(_d) ORDER BY 1 LOOP
    cands := cands || (wk + (wd - 1));
  END LOOP;
  cands := cands || (_d + 1) || (_d + 2);
  ws := ARRAY[coalesce(_w, (public.sched_windows(_s))[1])] || array_remove(public.sched_windows(_s), coalesce(_w, (public.sched_windows(_s))[1]));
  FOREACH c IN ARRAY cands LOOP
    CONTINUE WHEN c = _d OR c <= today OR c < public.sched_launch_date(_s) OR public.sched_dow(c) = 7;
    CONTINUE WHEN public.sched_blocked(_s, _zip, c);
    CONTINUE WHEN public.sched_pro_cap(_pro, c) <= 0;
    CONTINUE WHEN public.sched_booked(_pro, c, _excl) + _budget > public.sched_pro_cap(_pro, c) + 0.0001;
    CONTINUE WHEN _sub IS NOT NULL AND EXISTS (SELECT 1 FROM public.visits v WHERE v.subscription_id = _sub AND v.service = _s AND v.visit_date = c AND v.id IS DISTINCT FROM _excl);
    FOREACH w IN ARRAY ws LOOP
      IF cu IS NOT NULL AND public.sched_dow(c) = cu THEN
        SELECT * INTO t FROM public.sched_window_times(_s, w);
        CONTINUE WHEN ((c + make_time(t.start_h, 0, 0)) AT TIME ZONE 'America/New_York') < now() + interval '24 hours';
      END IF;
      IF _s::text = 'cleaning' AND (EXISTS (SELECT 1 FROM public.visits v WHERE v.assigned_pro_id = _pro AND v.visit_date = c AND v.service::text = 'cleaning'
           AND v.window_key = w AND v.id IS DISTINCT FROM _excl AND v.status::text NOT IN ('canceled','skipped'))
           OR NOT public.sched_cleaning_seq_ok(_pro, c, w, _budget, NULL)) THEN CONTINUE; END IF;
      slot_date := c; slot_window := w; RETURN;
    END LOOP;
  END LOOP;
END $function$;

ALTER TABLE public.sched_waitlist ADD COLUMN IF NOT EXISTS window_key text;
ALTER TABLE public.sched_waitlist ADD COLUMN IF NOT EXISTS founding_hold_until timestamptz;
ALTER TABLE public.sched_waitlist ADD COLUMN IF NOT EXISTS hold_warned_at timestamptz;
ALTER TABLE public.sched_waitlist ADD COLUMN IF NOT EXISTS hold_lapsed_at timestamptz;
UPDATE public.sched_waitlist SET founding_hold_until = created_at + interval '30 days' WHERE founding_hold_until IS NULL;
ALTER TABLE public.sched_waitlist ALTER COLUMN founding_hold_until SET DEFAULT now() + interval '30 days';

CREATE OR REPLACE FUNCTION public.customer_waitlist_join(_service service_type, _weekday integer DEFAULT NULL, _window text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r jsonb;
BEGIN
  IF _window IS NOT NULL AND NOT (_window = ANY(public.sched_windows(_service))) THEN RAISE EXCEPTION 'invalid_window'; END IF;
  r := public.customer_join_waitlist(_service, _weekday);
  IF _window IS NOT NULL THEN
    UPDATE public.sched_waitlist SET window_key = _window WHERE user_id = auth.uid() AND service = _service AND status = 'waiting' AND weekday IS NOT DISTINCT FROM _weekday;
  END IF;
  RETURN r || jsonb_build_object('founding_hold_until', (SELECT max(founding_hold_until) FROM public.sched_waitlist WHERE user_id = auth.uid() AND service = _service AND status = 'waiting'));
END $$;
GRANT EXECUTE ON FUNCTION public.customer_waitlist_join(service_type, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sched_waitlist_holds()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE q record; es boolean;
BEGIN
  FOR q IN SELECT w.* FROM public.sched_waitlist w
           WHERE w.status = 'waiting' AND w.hold_warned_at IS NULL AND w.founding_hold_until <= now() + interval '3 days' AND w.founding_hold_until > now() LOOP
    es := public.user_lang(q.user_id) = 'es';
    BEGIN
      PERFORM public.notify_member(q.user_id, 'waitlist_hold_ending',
        CASE WHEN es THEN 'Su reserva fundadora vence pronto' ELSE 'Your founding hold ends soon' END,
        CASE WHEN es THEN format('Seguimos buscando un horario para usted. Su número fundador y su tarifa están reservados hasta el %s.', to_char(q.founding_hold_until AT TIME ZONE 'America/New_York', 'DD/MM'))
             ELSE format('We''re still looking for a %s slot for you. Your founding number and rate are held until %s.', lower(public.sched_svc_label(q.service)), public.sched_fmt((q.founding_hold_until AT TIME ZONE 'America/New_York')::date)) END,
        'wl-hold-warn-' || q.id, NULL, NULL);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
    UPDATE public.sched_waitlist SET hold_warned_at = now() WHERE id = q.id;
  END LOOP;
  FOR q IN SELECT w.* FROM public.sched_waitlist w WHERE w.status = 'waiting' AND w.hold_lapsed_at IS NULL AND w.founding_hold_until <= now() LOOP
    UPDATE public.sched_waitlist SET hold_lapsed_at = now() WHERE id = q.id;
    PERFORM public.sched_alert('schedule_waitlist_hold_lapsed', format('Founding hold lapsed · %s waitlist in %s', public.sched_svc_label(q.service), q.zip),
      'A waitlisted member went 30 days without a slot. Their founding number and rate are no longer held — decide whether to keep or release them.',
      'action', '/admin/calendar', 'wl-hold-lapsed-' || q.id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sched_waitlist_holds() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sched_demand_rows()
 RETURNS TABLE (service text, zip text, weekday int, day text, preferences int, share numeric, mornings int, afternoons int, claimed boolean, flagged boolean, fit_pct numeric)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH prefs AS (
    SELECT CASE s WHEN 'car' THEN 'detailing' WHEN 'car_care' THEN 'detailing' ELSE s END svc, left(r.zip, 5) z,
           CASE lower(r.preferred_day) WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 END wd,
           lower(coalesce(r.preferred_time, '')) tm
      FROM public.reservations r CROSS JOIN LATERAL unnest(coalesce(r.services, '{}'::text[])) s
     WHERE coalesce(r.status, '') NOT IN ('cancelled','canceled') AND r.preferred_day IS NOT NULL
  ), agg AS (
    SELECT svc, z, wd, count(*)::int n, count(*) FILTER (WHERE tm = 'morning')::int am, count(*) FILTER (WHERE tm <> 'morning')::int pm FROM prefs WHERE wd IS NOT NULL GROUP BY 1,2,3
  ), tot AS (SELECT svc, z, sum(n) t FROM agg GROUP BY 1,2),
  cl AS (SELECT DISTINCT service::text svc, zip z, weekday wd FROM public.pro_day_claims WHERE status IN ('active','pending','dropping'))
  SELECT a.svc, a.z, a.wd, public.sched_day_name(a.wd), a.n, round(a.n / t.t * 100, 0), a.am, a.pm,
         EXISTS (SELECT 1 FROM cl WHERE cl.svc = a.svc AND cl.z = a.z AND cl.wd = a.wd),
         a.n / t.t > 0.25 AND NOT EXISTS (SELECT 1 FROM cl WHERE cl.svc = a.svc AND cl.z = a.z AND cl.wd = a.wd),
         round(100.0 * (SELECT coalesce(sum(b.n), 0) FROM agg b WHERE b.svc = a.svc AND b.z = a.z AND EXISTS (SELECT 1 FROM cl WHERE cl.svc = b.svc AND cl.z = b.z AND cl.wd = b.wd)) / t.t, 0)
    FROM agg a JOIN tot t USING (svc, z) ORDER BY 1, 2, 3
$$;
REVOKE ALL ON FUNCTION public.sched_demand_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sched_demand_rows() TO service_role;

CREATE OR REPLACE FUNCTION public.admin_demand_report()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN jsonb_build_object(
    'rows', (SELECT coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) FROM public.sched_demand_rows() d),
    'claims', (SELECT coalesce(jsonb_agg(jsonb_build_object('service', service, 'zip', zip, 'weekday', weekday, 'start', to_char(start_time,'HH24:MI'), 'end', to_char(end_time,'HH24:MI'), 'status', status)), '[]'::jsonb)
                 FROM public.pro_day_claims WHERE status IN ('active','pending','dropping')),
    'missing_preference', (SELECT count(*) FROM public.reservations WHERE preferred_day IS NULL AND coalesce(status,'') NOT IN ('cancelled','canceled')));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_demand_report() TO authenticated;

CREATE OR REPLACE FUNCTION public.sched_customer_sms(_user uuid, _sms text, _dedupe text, _kind text, _expires timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE p record; digits text; e164 text;
BEGIN
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
REVOKE ALL ON FUNCTION public.sched_customer_sms(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sched_tick()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE c public.pro_day_claims; b public.customer_bookings; q record; v record; uid uuid; today date := public.sched_today();
        hr int := extract(hour FROM now() AT TIME ZONE 'America/New_York')::int; n_drop int := 0; es boolean; en_txt text; es_txt text; t record;
BEGIN
  FOR uid IN SELECT DISTINCT pro_user_id FROM public.pro_day_claims WHERE status IN ('pending','active') LOOP
    PERFORM public.sched_sync_pro(uid);
  END LOOP;
  UPDATE public.pro_day_claims SET start_time = pending_start, end_time = pending_end, pending_start = NULL, pending_end = NULL, hours_effective = NULL
   WHERE hours_effective IS NOT NULL AND hours_effective <= today AND pending_start IS NOT NULL;
  FOR c IN SELECT * FROM public.pro_day_claims WHERE status = 'dropping' AND drop_effective <= today LOOP
    FOR b IN SELECT * FROM public.customer_bookings WHERE claim_id = c.id AND status = 'active' LOOP
      UPDATE public.visits SET status = 'canceled', lifecycle_reason = 'day_lost' WHERE booking_id = b.id AND status::text = 'scheduled' AND visit_date >= c.drop_effective;
      UPDATE public.customer_bookings SET status = 'ended', ended_at = now(), end_reason = 'day_lost' WHERE id = b.id;
      INSERT INTO public.sched_waitlist (user_id, subscription_id, service, zip, kind) VALUES (b.user_id, b.subscription_id, b.service, b.zip, 'zip') ON CONFLICT DO NOTHING;
      PERFORM public.sched_customer_notice(b.user_id, 'moved_to_waitlist', 'You''re on the waitlist',
        format('Your %s day ended and no other day had room yet. You''re first in line — we''ll offer the next opening and hold it 48 hours.', public.sched_svc_label(b.service)),
        'wl-dayloss-' || b.id, NULL, NULL, NULL);
    END LOOP;
    UPDATE public.pro_day_claims SET status = 'ended', ended_at = now() WHERE id = c.id;
    n_drop := n_drop + 1;
    IF EXISTS (SELECT 1 FROM public.service_days WHERE service = c.service AND zip = c.zip AND weekday = c.weekday AND active AND close_effective IS NULL) THEN
      FOR uid IN SELECT DISTINCT a.contractor_id FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND a.contractor_id <> c.pro_user_id AND c.service = ANY(public.sched_pro_services(a.contractor_id)) LOOP
        PERFORM public.sched_pro_notice(uid, 'open_day', format('%s in %s is open', public.sched_day_name(c.weekday), c.zip),
          format('%s in %s is open — claim it in your schedule.', public.sched_day_name(c.weekday), c.zip), '/pro/schedule', 'reopen-' || c.id || '-' || uid);
      END LOOP;
    END IF;
  END LOOP;
  UPDATE public.service_days SET active = false, closed_at = now() WHERE active AND close_effective IS NOT NULL AND close_effective <= today;
  FOR c IN SELECT * FROM public.pro_day_claims WHERE status = 'dropping' AND drop_effective - today IN (7, 1) LOOP
    PERFORM public.sched_pro_notice(c.pro_user_id, 'drop_reminder', format('%s in %s ends %s', public.sched_day_name(c.weekday), c.zip, public.sched_fmt(c.drop_effective)),
      format('Your last %s in %s is before %s.', public.sched_day_name(c.weekday), c.zip, public.sched_fmt(c.drop_effective)), '/pro/schedule', 'drop-rem-' || c.id || '-' || (c.drop_effective - today));
  END LOOP;
  UPDATE public.sched_first_right SET status = 'expired' WHERE status = 'offered' AND expires_at <= now();
  FOR q IN UPDATE public.sched_waitlist SET status = 'expired' WHERE status = 'offered' AND hold_until <= now() RETURNING service, zip LOOP
    PERFORM public.sched_waitlist_offer(q.service, q.zip);
  END LOOP;
  FOR q IN SELECT DISTINCT service, zip FROM public.sched_waitlist WHERE status = 'waiting' LOOP
    PERFORM public.sched_waitlist_offer(q.service, q.zip);
  END LOOP;
  IF public.sched_once('wl-holds-' || today) THEN PERFORM public.sched_waitlist_holds(); END IF;
  IF hr = 18 THEN
    FOR v IN SELECT id, user_id, service, window_key, scheduled_start FROM public.visits WHERE visit_date = today + 1 AND booking_id IS NOT NULL AND status::text = 'scheduled' LOOP
      es := public.user_lang(v.user_id) = 'es';
      SELECT * INTO t FROM public.sched_window_times(v.service, coalesce(v.window_key, (public.sched_windows(v.service))[1]));
      IF v.service::text = 'lawn' THEN
        en_txt := 'Your Tidy lawn visit is tomorrow — done by 6 PM.'; es_txt := 'Su visita de grama de Tidy es mañana — lista antes de las 6 PM.';
      ELSE
        en_txt := format('Your Tidy %s is tomorrow, arriving %s.', CASE WHEN v.service::text = 'cleaning' THEN 'cleaning' ELSE 'car care' END, t.label);
        es_txt := format('Su %s de Tidy es mañana, llegando %s.', CASE WHEN v.service::text = 'cleaning' THEN 'limpieza' ELSE 'cuidado del auto' END, t.label);
      END IF;
      BEGIN
        PERFORM public.notify_member(v.user_id, 'visit_reminder', CASE WHEN es THEN 'Su visita de Tidy es mañana' ELSE 'Your Tidy visit is tomorrow' END,
          CASE WHEN es THEN es_txt ELSE en_txt END, 'remind-' || v.id, v.id, NULL);
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
      PERFORM public.sched_customer_sms(v.user_id, 'Tidy: ' || CASE WHEN es THEN es_txt ELSE en_txt END, 'remind-' || v.id, 'visit_reminder', v.scheduled_start);
    END LOOP;
  END IF;
  IF public.sched_once('ladder-' || today) THEN PERFORM public.sched_ladder(); END IF;
  RETURN jsonb_build_object('drops_processed', n_drop);
END $function$;

CREATE OR REPLACE FUNCTION public.sched_ladder()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r jsonb; s public.service_type; z text; pct int; sd public.service_days; wd int; pro uuid; today date := public.sched_today(); spec text;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(public.sched_routes()) LOOP
    s := (r->>'service')::public.service_type; z := r->>'zip'; pct := round((r->>'utilisation')::numeric * 100);
    IF (r->>'waitlist')::int > 0 AND jsonb_array_length(r->'open_unclaimed') > 0 THEN
      PERFORM public.sched_alert('schedule_waitlist_open_day', format('%s waiting for %s in %s — and a day is unclaimed', r->>'waitlist', public.sched_svc_label(s), z),
        'Customers are on the waitlist while an open service day has no Pro. Get it claimed or hire for it.', 'critical', '/admin/calendar', 'wl-open-' || s || '-' || z || '-' || today);
    END IF;
    CONTINUE WHEN (r->>'utilisation')::numeric < 0.85;
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.sched_first_right f WHERE f.service = s AND f.zip = z AND f.status = 'offered' AND f.expires_at > now());
    SELECT * INTO sd FROM public.service_days x WHERE x.service = s AND x.zip = z AND x.active AND x.close_effective IS NULL
      AND x.opened_at > now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.pro_day_claims c WHERE c.service = s AND c.zip = z AND c.weekday = x.weekday AND c.status <> 'ended')
      ORDER BY x.weekday LIMIT 1;
    IF FOUND THEN
      FOR pro IN SELECT DISTINCT a.contractor_id FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND s = ANY(public.sched_pro_services(a.contractor_id)) LOOP
        PERFORM public.sched_pro_notice(pro, 'open_day', format('%s in %s is open', public.sched_day_name(sd.weekday), z),
          format('%s in %s is open — claim it in your schedule.', public.sched_day_name(sd.weekday), z), '/pro/schedule', 'ladderA-' || sd.id || '-' || pro || '-' || today);
      END LOOP;
      PERFORM public.sched_alert('schedule_ladder_a', format('%s in %s is at %s%%', public.sched_svc_label(s), z, pct),
        format('%s in %s is open — Pros have been told to claim it in their schedule.', public.sched_day_name(sd.weekday), z), 'action', '/admin/calendar', 'ladderA-' || s || '-' || z || '-' || today);
      CONTINUE;
    END IF;
    SELECT * INTO sd FROM public.service_days x WHERE x.service = s AND x.zip = z AND x.active AND x.close_effective IS NULL
      AND x.opened_at <= now() - interval '3 days'
      AND NOT EXISTS (SELECT 1 FROM public.pro_day_claims c WHERE c.service = s AND c.zip = z AND c.weekday = x.weekday AND c.status <> 'ended')
      ORDER BY x.weekday LIMIT 1;
    IF FOUND THEN
      spec := format('Hire a %s Pro for %s, %s. Current Pros have no spare days.', lower(public.sched_svc_label(s)), z, public.sched_day_name(sd.weekday));
      INSERT INTO public.hire_specs (service, zip, weekday, spec) VALUES (s, z, sd.weekday, spec) ON CONFLICT DO NOTHING;
      PERFORM public.sched_alert('schedule_hire', spec, format('%s in %s is at %s%%. The spec is attached to the hiring pipeline.', public.sched_svc_label(s), z, pct),
        'critical', '/admin/pipeline', 'ladderC-' || s || '-' || z || '-' || sd.weekday || '-' || today);
      CONTINUE;
    END IF;
    SELECT w INTO wd FROM generate_series(1, 6) w WHERE NOT EXISTS (SELECT 1 FROM public.service_days x WHERE x.service = s AND x.zip = z AND x.weekday = w AND x.active) ORDER BY w LIMIT 1;
    IF wd IS NOT NULL THEN
      PERFORM public.sched_alert('schedule_ladder_b', format('%s in %s is at %s%%. Open %s for %s?', public.sched_svc_label(s), z, pct, public.sched_day_name(wd), z),
        'One tap opens it as a service day; it goes first to the Pro already serving this ZIP (72 hours), then to everyone.', 'action',
        format('/admin/calendar?open=%s:%s:%s', s, z, wd), 'ladderB-' || s || '-' || z || '-' || today);
    END IF;
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.sched_options(_user uuid, _s service_type)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE sub public.subscriptions; ln jsonb; cad text; sz smallint; v_zip text; budget numeric; bk public.customer_bookings;
        c public.pro_day_claims; w text; fd date; wins jsonb; opts jsonb := '[]'::jsonb; t record;
BEGIN
  SELECT s.* INTO sub FROM public.subscriptions s
   WHERE s.user_id = _user AND s.status = 'active' AND s.plan_lines @> jsonb_build_array(jsonb_build_object('service', _s::text))
   ORDER BY s.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'no_plan'); END IF;
  SELECT x INTO ln FROM jsonb_array_elements(sub.plan_lines) x WHERE x->>'service' = _s::text LIMIT 1;
  cad := coalesce(ln->>'cadence', 'monthly'); sz := NULLIF(ln->>'size_tier','')::smallint;
  SELECT p.zip INTO v_zip FROM public.profiles p WHERE p.user_id = _user;
  IF v_zip IS NULL THEN SELECT r.zip INTO v_zip FROM public.reservations r WHERE r.user_id = _user ORDER BY r.created_at DESC LIMIT 1; END IF;
  v_zip := left(coalesce(v_zip, ''), 5);
  budget := public.sched_budget(_s, sz, public.sched_std_kind(_s));
  SELECT * INTO bk FROM public.customer_bookings cb WHERE cb.subscription_id = sub.id AND cb.service = _s AND cb.status = 'active';
  FOR c IN SELECT * FROM public.pro_day_claims pc WHERE pc.service = _s AND pc.zip = v_zip AND pc.status = 'active' ORDER BY pc.weekday LOOP
    CONTINUE WHEN NOT public.sched_pro_active(c.pro_user_id);
    wins := '[]'::jsonb;
    IF NOT EXISTS (SELECT 1 FROM public.sched_waitlist q WHERE q.service = _s AND q.zip = v_zip AND q.status = 'offered'
                     AND q.hold_until > now() AND q.offer_weekday = c.weekday AND q.user_id <> _user) THEN
      FOREACH w IN ARRAY public.sched_windows(_s) LOOP
        fd := public.sched_first_date(c.id, cad, w, budget, bk.id);
        IF fd IS NOT NULL THEN
          SELECT * INTO t FROM public.sched_window_times(_s, w);
          wins := wins || jsonb_build_object('key', w, 'label', t.label, 'first_date', fd);
        END IF;
      END LOOP;
    END IF;
    opts := opts || jsonb_build_object('weekday', c.weekday, 'day', public.sched_day_name(c.weekday), 'claim_id', c.id,
      'pro_first_name', public.sched_pro_first_name(c.pro_user_id), 'full', jsonb_array_length(wins) = 0, 'windows', wins);
  END LOOP;
  RETURN jsonb_build_object('service', _s, 'zip', v_zip, 'cadence', cad, 'size_tier', sz, 'budget_hours', budget, 'subscription_id', sub.id,
    'launch_date', public.sched_launch_date(_s),
    'booking', CASE WHEN bk.id IS NULL THEN NULL ELSE jsonb_build_object('id', bk.id, 'weekday', bk.weekday, 'day', public.sched_day_name(bk.weekday),
        'window', bk.window_key, 'first_visit_date', bk.first_visit_date,
        'pro_first_name', (SELECT public.sched_pro_first_name(pc.pro_user_id) FROM public.pro_day_claims pc WHERE pc.id = bk.claim_id),
        'losing_day', (SELECT pc.drop_effective FROM public.pro_day_claims pc WHERE pc.id = bk.claim_id AND pc.status = 'dropping')) END,
    'options', opts,
    'waitlist', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'weekday', q.weekday, 'window', q.window_key, 'status', q.status,
        'offer_weekday', q.offer_weekday, 'hold_until', q.hold_until, 'founding_hold_until', q.founding_hold_until)), '[]'::jsonb)
       FROM public.sched_waitlist q WHERE q.user_id = _user AND q.service = _s AND q.status IN ('waiting','offered')));
END $function$;