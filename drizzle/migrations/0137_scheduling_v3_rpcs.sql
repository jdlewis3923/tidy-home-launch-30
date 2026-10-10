CREATE OR REPLACE FUNCTION public.sched_options(_user uuid, _s public.service_type) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    'launch_date', public.sched_launch_date(),
    'booking', CASE WHEN bk.id IS NULL THEN NULL ELSE jsonb_build_object('id', bk.id, 'weekday', bk.weekday, 'day', public.sched_day_name(bk.weekday),
        'window', bk.window_key, 'first_visit_date', bk.first_visit_date,
        'pro_first_name', (SELECT public.sched_pro_first_name(pc.pro_user_id) FROM public.pro_day_claims pc WHERE pc.id = bk.claim_id),
        'losing_day', (SELECT pc.drop_effective FROM public.pro_day_claims pc WHERE pc.id = bk.claim_id AND pc.status = 'dropping')) END,
    'options', opts,
    'waitlist', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'weekday', q.weekday, 'status', q.status,
        'offer_weekday', q.offer_weekday, 'hold_until', q.hold_until)), '[]'::jsonb)
       FROM public.sched_waitlist q WHERE q.user_id = _user AND q.service = _s AND q.status IN ('waiting','offered')));
END $$;
REVOKE ALL ON FUNCTION public.sched_options(uuid, public.service_type) FROM PUBLIC, anon, authenticated;

-- ===================== CUSTOMER =====================
CREATE OR REPLACE FUNCTION public.customer_day_options(_service public.service_type) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN public.sched_options(auth.uid(), _service);
END $$;

CREATE OR REPLACE FUNCTION public.customer_book_day(_service public.service_type, _weekday int, _window text, _details jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o jsonb; opt jsonb; claim uuid; fd date; old public.customer_bookings; oc public.pro_day_claims; nc public.pro_day_claims;
        nb uuid; nxt timestamptz; d jsonb := '{}'::jsonb; k text; pro_name text; t record; same_day boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (_window = ANY(public.sched_windows(_service))) THEN RAISE EXCEPTION 'invalid_window'; END IF;
  FOREACH k IN ARRAY ARRAY['gate_code','gate_location','entry_method','entry_note','vehicle','parking_spot','interior_access'] LOOP
    IF coalesce(_details->>k, '') <> '' THEN d := d || jsonb_build_object(k, left(btrim(_details->>k), 200)); END IF;
  END LOOP;
  IF _service::text = 'cleaning' AND coalesce(d->>'entry_method','') NOT IN ('home','lockbox','code','key') THEN RAISE EXCEPTION 'entry_method_required'; END IF;
  o := public.sched_options(uid, _service);
  IF o ? 'error' THEN RAISE EXCEPTION '%', o->>'error'; END IF;
  FOR opt IN SELECT * FROM jsonb_array_elements(o->'options') LOOP
    IF (opt->>'weekday')::int = _weekday THEN
      claim := (opt->>'claim_id')::uuid;
      SELECT (x->>'first_date')::date INTO fd FROM jsonb_array_elements(opt->'windows') x WHERE x->>'key' = _window;
    END IF;
  END LOOP;
  IF claim IS NULL THEN RAISE EXCEPTION 'day_not_offered'; END IF;
  IF fd IS NULL THEN RAISE EXCEPTION 'no_room'; END IF;
  SELECT * INTO nc FROM public.pro_day_claims WHERE id = claim;
  SELECT * INTO old FROM public.customer_bookings WHERE subscription_id = (o->>'subscription_id')::uuid AND service = _service AND status = 'active';
  IF old.id IS NOT NULL THEN
    -- Changing a recurring day or window needs 48 hours' notice.
    SELECT min(scheduled_start) INTO nxt FROM public.visits WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now();
    IF nxt IS NOT NULL AND nxt <= now() + interval '48 hours' THEN RAISE EXCEPTION 'inside_48h'; END IF;
    SELECT * INTO oc FROM public.pro_day_claims WHERE id = old.claim_id;
    same_day := old.claim_id = claim;
    IF same_day THEN
      UPDATE public.customer_bookings SET window_key = _window, details = old.details || d, updated_at = now() WHERE id = old.id;
      UPDATE public.visits SET window_key = _window WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now() + interval '48 hours';
      nb := old.id; fd := coalesce((SELECT min(visit_date) FROM public.visits WHERE booking_id = old.id AND status::text = 'scheduled' AND visit_date >= public.sched_today()), fd);
    ELSE
      UPDATE public.visits SET status = 'canceled', lifecycle_reason = 'day_changed' WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now() + interval '48 hours';
      UPDATE public.customer_bookings SET status = 'ended', ended_at = now(), end_reason = 'day_changed' WHERE id = old.id;
      UPDATE public.reschedule_items SET status = 'resolved', resolved_at = now(), resolution_note = 'Customer chose a new day' WHERE booking_id = old.id AND status = 'open';
    END IF;
  END IF;
  IF nb IS NULL THEN
    INSERT INTO public.customer_bookings (user_id, subscription_id, service, zip, weekday, window_key, cadence, budget_hours, first_visit_date, claim_id, details)
    VALUES (uid, (o->>'subscription_id')::uuid, _service, o->>'zip', _weekday, _window, o->>'cadence', (o->>'budget_hours')::numeric, fd, claim,
            coalesce(old.details, '{}'::jsonb) || d)
    RETURNING id INTO nb;
    PERFORM public.sched_generate_booking(nb, public.sched_today() + 45);
  END IF;
  UPDATE public.sched_waitlist SET status = 'booked' WHERE user_id = uid AND service = _service AND status IN ('waiting','offered');
  pro_name := public.sched_pro_first_name(nc.pro_user_id);
  SELECT * INTO t FROM public.sched_window_times(_service, _window);
  PERFORM public.sched_customer_notice(uid, 'day_confirmed', 'Your Tidy day is confirmed',
    format('%s every %s%s, %s. First visit %s. Your Pro is %s.', public.sched_svc_label(_service), public.sched_day_name(_weekday),
      CASE WHEN _service::text = 'lawn' THEN '' ELSE ' (' || t.label || ')' END, o->>'cadence', public.sched_fmt(fd), pro_name),
    'confirmed-' || nb || '-' || _window, NULL,
    format('Tidy: your %s day is %s, %s. First visit %s. Your Pro is %s.', lower(public.sched_svc_label(_service)), public.sched_day_name(_weekday), t.label, public.sched_fmt(fd), pro_name), NULL);
  IF old.id IS NOT NULL AND oc.pro_user_id IS DISTINCT FROM nc.pro_user_id THEN
    PERFORM public.sched_customer_notice(uid, 'pro_changed', 'Your Pro has changed',
      format('Your %s Pro is now %s.', lower(public.sched_svc_label(_service)), pro_name), 'prochange-' || nb, NULL,
      format('Tidy: your %s Pro is now %s.', lower(public.sched_svc_label(_service)), pro_name), NULL);
  END IF;
  IF old.id IS NULL OR NOT same_day THEN
    PERFORM public.sched_pro_notice(nc.pro_user_id, 'new_customer', format('New customer on your %s', public.sched_day_name(_weekday)),
      format('A %s customer in %s was added to your %s, starting %s.', lower(public.sched_svc_label(_service)), o->>'zip', public.sched_day_name(_weekday), public.sched_fmt(fd)),
      '/pro/schedule', 'newcust-' || nb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'booking_id', nb, 'weekday', _weekday, 'day', public.sched_day_name(_weekday), 'window', _window,
    'window_label', t.label, 'first_visit_date', fd, 'pro_first_name', pro_name);
END $$;

CREATE OR REPLACE FUNCTION public.customer_join_waitlist(_service public.service_type, _weekday int DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o jsonb; id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _weekday IS NOT NULL AND _weekday NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'invalid_weekday'; END IF;
  o := public.sched_options(uid, _service);
  IF o ? 'error' THEN RAISE EXCEPTION '%', o->>'error'; END IF;
  INSERT INTO public.sched_waitlist (user_id, subscription_id, service, zip, weekday, kind)
  VALUES (uid, (o->>'subscription_id')::uuid, _service, o->>'zip', _weekday, CASE WHEN _weekday IS NULL THEN 'zip' ELSE 'day' END)
  ON CONFLICT DO NOTHING RETURNING sched_waitlist.id INTO id;
  RETURN jsonb_build_object('ok', true, 'id', id);
END $$;

CREATE OR REPLACE FUNCTION public.customer_move_visit(_visit uuid, _date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v public.visits; t record; newstart timestamptz;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = _visit AND user_id = uid;
  IF NOT FOUND OR v.booking_id IS NULL OR v.status::text <> 'scheduled' THEN RAISE EXCEPTION 'visit_not_movable'; END IF;
  IF v.scheduled_start <= now() + interval '48 hours' THEN RAISE EXCEPTION 'inside_48h'; END IF;
  IF _date = v.visit_date OR abs(_date - v.visit_date) > 7 THEN RAISE EXCEPTION 'outside_7_days'; END IF;
  IF public.sched_dow(_date) = 7 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  SELECT * INTO t FROM public.sched_window_times(v.service, v.window_key);
  newstart := (_date::timestamp + make_interval(hours => t.start_h)) AT TIME ZONE 'America/New_York';
  IF newstart <= now() + interval '48 hours' THEN RAISE EXCEPTION 'inside_48h'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pro_day_claims c WHERE c.pro_user_id = v.assigned_pro_id AND c.service = v.service AND c.zip = v.zip
                   AND c.weekday = public.sched_dow(_date) AND c.status = 'active') THEN RAISE EXCEPTION 'pro_not_working'; END IF;
  IF public.sched_blocked(v.service, v.zip, _date) THEN RAISE EXCEPTION 'date_closed'; END IF;
  PERFORM public.sched_move_visit(_visit, _date, v.window_key, 'customer_request');  -- capacity enforced by the visits trigger
  RETURN jsonb_build_object('ok', true, 'visit_date', _date);
END $$;

-- ===================== PRO =====================
CREATE OR REPLACE FUNCTION public.sched_me_pro() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.applicants WHERE contractor_id = uid) AND NOT public.has_role(uid, 'pro') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN uid;
END $$;
REVOKE ALL ON FUNCTION public.sched_me_pro() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pro_schedule_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); s public.service_type; z text; w int; sd public.service_days; c public.pro_day_claims;
        cells jsonb := '[]'::jsonb; st text; today date := public.sched_today(); booked int; locked_count int;
BEGIN
  FOREACH s IN ARRAY public.sched_pro_services(uid) LOOP
    FOREACH z IN ARRAY public.sched_zips() LOOP
      FOR w IN 1..6 LOOP
        SELECT * INTO sd FROM public.service_days x WHERE x.service = s AND x.zip = z AND x.weekday = w;
        SELECT * INTO c FROM public.pro_day_claims x WHERE x.service = s AND x.zip = z AND x.weekday = w AND x.status <> 'ended';
        booked := 0; locked_count := 0;
        IF c.id IS NOT NULL AND c.pro_user_id = uid THEN
          SELECT count(*) INTO booked FROM public.customer_bookings WHERE claim_id = c.id AND status = 'active';
          SELECT count(*) INTO locked_count FROM public.visits WHERE claim_id = c.id AND status::text = 'scheduled' AND visit_date BETWEEN today AND today + 13;
          st := CASE WHEN c.status = 'dropping' OR locked_count > 0 THEN 'LOCKED' ELSE 'MINE' END;
        ELSIF c.id IS NOT NULL THEN st := 'TAKEN';
        ELSIF sd.id IS NULL OR NOT sd.active OR sd.close_effective IS NOT NULL THEN st := 'NOT_SERVED';
        ELSE st := 'OPEN';
        END IF;
        cells := cells || jsonb_build_object('service', s, 'zip', z, 'weekday', w, 'state', st,
          'claim', CASE WHEN c.id IS NOT NULL AND c.pro_user_id = uid THEN jsonb_build_object('id', c.id, 'status', c.status,
            'start', to_char(c.start_time, 'HH24:MI'), 'end', to_char(c.end_time, 'HH24:MI'), 'drop_effective', c.drop_effective,
            'pending_start', to_char(c.pending_start, 'HH24:MI'), 'pending_end', to_char(c.pending_end, 'HH24:MI'), 'hours_effective', c.hours_effective,
            'customers', booked, 'locked_until', CASE WHEN locked_count > 0 THEN today + 14 END) END);
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('services', to_jsonb(public.sched_pro_services(uid)), 'zips', to_jsonb(public.sched_zips()),
    'catchup', (SELECT weekday FROM public.pro_catchup_days WHERE pro_user_id = uid), 'active', public.sched_pro_active(uid),
    'today', today, 'lock_until', today + 14, 'cells', cells);
END $$;

CREATE OR REPLACE FUNCTION public.pro_set_catchup(_weekday int) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro();
BEGIN
  IF _weekday NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  IF EXISTS (SELECT 1 FROM public.pro_day_claims WHERE pro_user_id = uid AND weekday = _weekday AND status <> 'ended') THEN RAISE EXCEPTION 'catchup_is_a_work_day'; END IF;
  INSERT INTO public.pro_catchup_days (pro_user_id, weekday) VALUES (uid, _weekday)
  ON CONFLICT (pro_user_id) DO UPDATE SET weekday = EXCLUDED.weekday, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'catchup', _weekday);
END $$;

CREATE OR REPLACE FUNCTION public.pro_claim_day(_service public.service_type, _zip text, _weekday int, _start text, _end text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); cu int; st time; en time; act boolean; c public.pro_day_claims;
BEGIN
  IF _weekday NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  IF NOT (_service = ANY(public.sched_pro_services(uid))) THEN RAISE EXCEPTION 'not_your_service'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.service_days WHERE service = _service AND zip = _zip AND weekday = _weekday AND active AND close_effective IS NULL) THEN RAISE EXCEPTION 'not_served'; END IF;
  SELECT weekday INTO cu FROM public.pro_catchup_days WHERE pro_user_id = uid;
  IF cu IS NULL THEN RAISE EXCEPTION 'catchup_required'; END IF;
  IF cu = _weekday THEN RAISE EXCEPTION 'catchup_conflict'; END IF;
  st := _start::time; en := _end::time;
  IF st < time '08:00' OR en > time '18:00' OR en - st < interval '4 hours' THEN RAISE EXCEPTION 'hours_invalid'; END IF;
  act := public.sched_pro_active(uid);
  BEGIN
    INSERT INTO public.pro_day_claims (pro_user_id, service, zip, weekday, start_time, end_time, status, activated_at)
    VALUES (uid, _service, _zip, _weekday, st, en, CASE WHEN act THEN 'active' ELSE 'pending' END, CASE WHEN act THEN now() END)
    RETURNING * INTO c;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'taken';
  END;
  IF act THEN
    PERFORM public.sched_waitlist_offer(_service, _zip);
  ELSE
    PERFORM public.sched_alert('schedule_pending_claim', format('Pending claim: %s %s in %s', public.sched_svc_label(_service), public.sched_day_name(_weekday), _zip),
      format('%s claimed it but is not active yet. It goes live automatically at stage 7.', public.sched_pro_first_name(uid)), 'action', '/admin/calendar', 'pending-' || c.id);
  END IF;
  RETURN jsonb_build_object('ok', true, 'claim_id', c.id, 'status', c.status);
END $$;

CREATE OR REPLACE FUNCTION public.pro_update_claim_hours(_claim uuid, _start text, _end text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); c public.pro_day_claims; st time := _start::time; en time := _end::time; newh numeric; d date; over boolean := false; eff date;
BEGIN
  SELECT * INTO c FROM public.pro_day_claims WHERE id = _claim AND pro_user_id = uid AND status IN ('active','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'claim_not_found'; END IF;
  IF st < time '08:00' OR en > time '18:00' OR en - st < interval '4 hours' THEN RAISE EXCEPTION 'hours_invalid'; END IF;
  newh := extract(epoch FROM (en - st)) / 3600.0;
  FOR d IN SELECT DISTINCT visit_date FROM public.visits WHERE claim_id = _claim AND status::text = 'scheduled' AND visit_date >= public.sched_today() LOOP
    IF (SELECT coalesce(sum(budget_hours),0) FROM public.visits WHERE claim_id = _claim AND visit_date = d AND status::text = 'scheduled') > newh * 0.80 + 0.0001
       OR EXISTS (SELECT 1 FROM public.visits v, public.sched_window_times(v.service, v.window_key) t WHERE v.claim_id = _claim AND v.visit_date = d
                  AND v.status::text = 'scheduled' AND (t.start_h < extract(hour FROM st) OR t.end_h > extract(hour FROM en) + extract(minute FROM en)/60.0)) THEN
      over := true;
    END IF;
  END LOOP;
  IF NOT over THEN
    UPDATE public.pro_day_claims SET start_time = st, end_time = en, pending_start = NULL, pending_end = NULL, hours_effective = NULL WHERE id = _claim;
    PERFORM public.sched_waitlist_offer(c.service, c.zip);
    RETURN jsonb_build_object('ok', true, 'immediate', true);
  END IF;
  eff := public.sched_today() + 14;
  UPDATE public.pro_day_claims SET pending_start = st, pending_end = en, hours_effective = eff WHERE id = _claim;
  INSERT INTO public.reschedule_items (claim_id, kind, reason, details, dedupe_key)
  VALUES (_claim, 'hours_shortened', 'Pro shortened hours below what is booked', jsonb_build_object('effective', eff, 'start', _start, 'end', _end), 'hours-' || _claim || '-' || eff)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'immediate', false, 'effective_date', eff,
    'message', format('Effective %s. Booked visits before then keep their times.', public.sched_fmt(eff)));
END $$;

CREATE OR REPLACE FUNCTION public.pro_drop_preview(_claim uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); n int; eff date := public.sched_today() + 14;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pro_day_claims WHERE id = _claim AND pro_user_id = uid AND status IN ('active','pending')) THEN RAISE EXCEPTION 'claim_not_found'; END IF;
  SELECT count(*) INTO n FROM public.customer_bookings WHERE claim_id = _claim AND status = 'active';
  IF n = 0 THEN RETURN jsonb_build_object('immediate', true, 'customers', 0, 'message', 'No customers are booked on this day. It will be dropped now.'); END IF;
  RETURN jsonb_build_object('immediate', false, 'customers', n, 'effective_date', eff,
    'message', format('Effective %s. %s customer%s will be offered a new day.', public.sched_fmt(eff), n, CASE WHEN n = 1 THEN '' ELSE 's' END));
END $$;

CREATE OR REPLACE FUNCTION public.pro_drop_day(_claim uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); c public.pro_day_claims; n int; eff date := public.sched_today() + 14; p uuid;
BEGIN
  SELECT * INTO c FROM public.pro_day_claims WHERE id = _claim AND pro_user_id = uid AND status IN ('active','pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'claim_not_found'; END IF;
  SELECT count(*) INTO n FROM public.customer_bookings WHERE claim_id = _claim AND status = 'active';
  IF n = 0 THEN
    UPDATE public.pro_day_claims SET status = 'ended', ended_at = now(), drop_reason = 'pro_dropped' WHERE id = _claim;
    FOR p IN SELECT DISTINCT a.contractor_id FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND a.contractor_id <> uid AND c.service = ANY(public.sched_pro_services(a.contractor_id)) LOOP
      PERFORM public.sched_pro_notice(p, 'open_day', format('%s in %s is open', public.sched_day_name(c.weekday), c.zip),
        format('%s in %s is open — claim it in your schedule.', public.sched_day_name(c.weekday), c.zip), '/pro/schedule', 'reopen-' || c.id || '-' || p);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'immediate', true);
  END IF;
  PERFORM public.sched_day_loss(_claim, eff, 'pro_dropped');
  RETURN jsonb_build_object('ok', true, 'immediate', false, 'effective_date', eff, 'customers', n);
END $$;

CREATE OR REPLACE FUNCTION public.pro_dates(_weeks int DEFAULT 8) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); today date := public.sched_today(); until date := today + least(greatest(_weeks,1),12) * 7;
BEGIN
  RETURN jsonb_build_object('today', today, 'until', until, 'lock_until', today + 14,
    'catchup', (SELECT weekday FROM public.pro_catchup_days WHERE pro_user_id = uid),
    'visits', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', d, 'count', n, 'services', svcs) ORDER BY d), '[]'::jsonb) FROM (
        SELECT visit_date d, count(*) n, jsonb_agg(DISTINCT service) svcs FROM public.visits
        WHERE assigned_pro_id = uid AND status::text = 'scheduled' AND visit_date BETWEEN today AND until GROUP BY visit_date) x),
    'off', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', off_date, 'kind', kind) ORDER BY off_date), '[]'::jsonb)
            FROM public.pro_date_exceptions WHERE pro_user_id = uid AND off_date BETWEEN today AND until),
    'blackouts', (SELECT coalesce(jsonb_agg(jsonb_build_object('date', off_date, 'label', label, 'kind', kind) ORDER BY off_date), '[]'::jsonb)
            FROM public.sched_blackouts WHERE off_date BETWEEN today AND until AND (service IS NULL OR service = ANY(public.sched_pro_services(uid)))));
END $$;

CREATE OR REPLACE FUNCTION public.pro_mark_off(_date date, _note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); today date := public.sched_today(); kind text; v record; moved int := 0; queued int := 0; r text; n60 int;
BEGIN
  IF _date < today THEN RAISE EXCEPTION 'date_passed'; END IF;
  kind := CASE WHEN _date < today + 14 THEN 'call_off' ELSE 'time_off' END;
  INSERT INTO public.pro_date_exceptions (pro_user_id, off_date, kind, note) VALUES (uid, _date, kind, left(_note, 300))
  ON CONFLICT (pro_user_id, off_date) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'already_off'; END IF;
  FOR v IN SELECT id FROM public.visits WHERE assigned_pro_id = uid AND visit_date = _date AND status::text = 'scheduled' ORDER BY scheduled_start LOOP
    r := public.sched_relocate_visit(v.id, kind);
    IF r = 'moved' THEN moved := moved + 1; ELSIF r = 'queued' THEN queued := queued + 1; END IF;
  END LOOP;
  IF kind = 'call_off' THEN
    SELECT count(*) INTO n60 FROM public.pro_date_exceptions WHERE pro_user_id = uid AND kind = 'call_off' AND created_at > now() - interval '60 days';
    IF n60 > 2 THEN
      PERFORM public.sched_alert('schedule_calloffs', format('%s has called off %s times in 60 days', public.sched_pro_first_name(uid), n60),
        'More than 2 call-offs in 60 days.', 'critical', '/admin/reschedules', 'calloffs-' || uid || '-' || today);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', kind, 'moved', moved, 'queued', queued);
END $$;

-- ===================== ADMIN =====================
CREATE OR REPLACE FUNCTION public.sched_require_admin() RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF; END $$;
REVOKE ALL ON FUNCTION public.sched_require_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_sched_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := public.sched_today();
BEGIN
  PERFORM public.sched_require_admin();
  RETURN jsonb_build_object('today', today, 'launch_date', public.sched_launch_date(), 'zips', to_jsonb(public.sched_zips()),
    'service_days', (SELECT coalesce(jsonb_agg(to_jsonb(sd)), '[]'::jsonb) FROM public.service_days sd),
    'claims', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'service', c.service, 'zip', c.zip, 'weekday', c.weekday, 'status', c.status,
        'start', to_char(c.start_time,'HH24:MI'), 'end', to_char(c.end_time,'HH24:MI'), 'drop_effective', c.drop_effective,
        'pro_first_name', public.sched_pro_first_name(c.pro_user_id), 'pro_active', public.sched_pro_active(c.pro_user_id),
        'fill_pct', (SELECT CASE WHEN cap > 0 THEN round(100 * bk / cap) ELSE 0 END FROM (
            SELECT (SELECT coalesce(sum(public.sched_claim_hours(c, g::date) * 0.80), 0) FROM generate_series(today, today + 27, interval '1 day') g
                     WHERE public.sched_dow(g::date) = c.weekday AND public.sched_claim_live_on(c, g::date)) cap,
                   (SELECT coalesce(sum(coalesce(budget_hours,0)),0) FROM public.visits WHERE claim_id = c.id AND visit_date BETWEEN today AND today + 27 AND status::text NOT IN ('canceled','skipped')) bk) f))), '[]'::jsonb)
      FROM public.pro_day_claims c WHERE c.status <> 'ended'),
    'blackouts', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.off_date), '[]'::jsonb) FROM public.sched_blackouts b WHERE b.off_date >= today),
    'routes', public.sched_routes(),
    'reschedules_open', (SELECT count(*) FROM public.reschedule_items WHERE status = 'open'),
    'hire_specs', (SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC), '[]'::jsonb) FROM public.hire_specs h WHERE h.status = 'open'));
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_service_day(_service public.service_type, _zip text, _weekday int, _active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims; n int; eff date := public.sched_today() + 14; p uuid;
BEGIN
  PERFORM public.sched_require_admin();
  IF _weekday NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  IF _zip !~ '^[0-9]{5}$' THEN RAISE EXCEPTION 'invalid_zip'; END IF;
  IF _active THEN
    INSERT INTO public.service_days (service, zip, weekday, active, opened_at) VALUES (_service, _zip, _weekday, true, now())
    ON CONFLICT (service, zip, weekday) DO UPDATE SET active = true, closed_at = NULL, close_effective = NULL,
      opened_at = CASE WHEN service_days.active AND service_days.close_effective IS NULL THEN service_days.opened_at ELSE now() END;
    IF NOT EXISTS (SELECT 1 FROM public.pro_day_claims WHERE service = _service AND zip = _zip AND weekday = _weekday AND status <> 'ended') THEN
      FOR p IN SELECT DISTINCT a.contractor_id FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND _service = ANY(public.sched_pro_services(a.contractor_id)) LOOP
        PERFORM public.sched_pro_notice(p, 'open_day', format('%s in %s is open', public.sched_day_name(_weekday), _zip),
          format('%s in %s is open — claim it in your schedule.', public.sched_day_name(_weekday), _zip), '/pro/schedule', 'opened-' || _service || _zip || _weekday || '-' || p || '-' || public.sched_today());
      END LOOP;
    END IF;
    RETURN jsonb_build_object('ok', true, 'state', 'open');
  END IF;
  SELECT * INTO c FROM public.pro_day_claims WHERE service = _service AND zip = _zip AND weekday = _weekday AND status <> 'ended';
  SELECT count(*) INTO n FROM public.customer_bookings WHERE claim_id = c.id AND status = 'active';
  IF c.id IS NOT NULL AND n > 0 THEN
    PERFORM public.sched_day_loss(c.id, eff, 'service_day_closed');
    UPDATE public.service_days SET close_effective = eff WHERE service = _service AND zip = _zip AND weekday = _weekday;
    RETURN jsonb_build_object('ok', true, 'state', 'closing', 'effective_date', eff, 'customers', n);
  END IF;
  IF c.id IS NOT NULL THEN UPDATE public.pro_day_claims SET status = 'ended', ended_at = now(), drop_reason = 'service_day_closed' WHERE id = c.id; END IF;
  UPDATE public.service_days SET active = false, closed_at = now(), close_effective = NULL WHERE service = _service AND zip = _zip AND weekday = _weekday;
  RETURN jsonb_build_object('ok', true, 'state', 'not_served');
END $$;

CREATE OR REPLACE FUNCTION public.admin_add_blackout(_date date, _label text, _kind text DEFAULT 'holiday', _service public.service_type DEFAULT NULL, _zip text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; moved int := 0; queued int := 0; r text;
BEGIN
  PERFORM public.sched_require_admin();
  IF _kind NOT IN ('holiday','weather') THEN RAISE EXCEPTION 'invalid_kind'; END IF;
  INSERT INTO public.sched_blackouts (off_date, service, zip, kind, label, created_by) VALUES (_date, _service, _zip, _kind, left(_label, 120), auth.uid())
  ON CONFLICT DO NOTHING;
  FOR v IN SELECT id FROM public.visits WHERE visit_date = _date AND status::text = 'scheduled'
             AND (_service IS NULL OR service = _service) AND (_zip IS NULL OR zip = _zip) ORDER BY scheduled_start LOOP
    r := public.sched_relocate_visit(v.id, _kind);
    IF r = 'moved' THEN moved := moved + 1; ELSIF r = 'queued' THEN queued := queued + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'moved', moved, 'queued', queued);
END $$;

CREATE OR REPLACE FUNCTION public.admin_weather_day(_service public.service_type, _zip text, _date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.admin_add_blackout(_date, format('Weather day: %s, %s, %s', lower(public.sched_svc_label(_service)), _zip, public.sched_fmt(_date)), 'weather', _service, _zip);
END $$;

CREATE OR REPLACE FUNCTION public.admin_remove_blackout(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.sched_require_admin(); DELETE FROM public.sched_blackouts WHERE id = _id; END $$;

CREATE OR REPLACE FUNCTION public.admin_reschedule_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sched_require_admin();
  RETURN (SELECT coalesce(jsonb_agg(row ORDER BY (row->>'status') = 'open' DESC, row->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('id', r.id, 'kind', r.kind, 'reason', r.reason, 'status', r.status, 'created_at', r.created_at, 'details', r.details,
      'resolution_note', r.resolution_note, 'visit_id', r.visit_id, 'visit_date', v.visit_date, 'service', coalesce(v.service::text, r.details->>'service'),
      'zip', coalesce(v.zip, r.details->>'zip'), 'customer', coalesce(v.customer_first_name, p.first_name), 'window', v.time_window,
      'pro', CASE WHEN v.assigned_pro_id IS NOT NULL THEN public.sched_pro_first_name(v.assigned_pro_id) END) AS row
    FROM public.reschedule_items r
    LEFT JOIN public.visits v ON v.id = r.visit_id
    LEFT JOIN public.customer_bookings b ON b.id = r.booking_id
    LEFT JOIN public.profiles p ON p.user_id = b.user_id
    WHERE r.status = 'open' OR r.resolved_at > now() - interval '14 days' LIMIT 300) x);
END $$;

CREATE OR REPLACE FUNCTION public.admin_resolve_reschedule(_id uuid, _note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sched_require_admin();
  UPDATE public.reschedule_items SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = left(_note, 500) WHERE id = _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_move_visit(_visit uuid, _date date, _window text, _reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits; over boolean;
BEGIN
  PERFORM public.sched_require_admin();
  IF length(btrim(coalesce(_reason,''))) < 3 THEN RAISE EXCEPTION 'reason_required'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found'; END IF;
  IF _date < public.sched_launch_date() THEN RAISE EXCEPTION 'before_launch'; END IF;
  over := v.assigned_pro_id IS NOT NULL AND public.sched_booked(v.assigned_pro_id, _date, v.id) + coalesce(v.budget_hours,0) > public.sched_pro_cap(v.assigned_pro_id, _date) + 0.0001;
  PERFORM set_config('tidy.capacity_override', 'on', true);
  PERFORM public.sched_move_visit(_visit, _date, coalesce(_window, v.window_key), 'admin: ' || _reason);
  PERFORM set_config('tidy.capacity_override', '', true);
  INSERT INTO public.capacity_overrides (visit_id, reason, admin_id, details)
  VALUES (_visit, _reason, auth.uid(), jsonb_build_object('from', v.visit_date, 'to', _date, 'over_capacity', over));
  UPDATE public.reschedule_items SET status = 'resolved', resolved_at = now(), resolved_by = auth.uid(), resolution_note = 'Moved by admin: ' || _reason
   WHERE visit_id = _visit AND status = 'open';
  RETURN jsonb_build_object('ok', true, 'over_capacity', over);
END $$;

DO $$ DECLARE f text; BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('customer_day_options','customer_book_day','customer_join_waitlist','customer_move_visit','pro_schedule_state','pro_set_catchup',
       'pro_claim_day','pro_update_claim_hours','pro_drop_preview','pro_drop_day','pro_dates','pro_mark_off','admin_sched_state','admin_set_service_day',
       'admin_add_blackout','admin_weather_day','admin_remove_blackout','admin_reschedule_list','admin_resolve_reschedule','admin_move_visit') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;