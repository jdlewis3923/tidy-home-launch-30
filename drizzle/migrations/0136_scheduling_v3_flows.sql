-- ===== options & waitlist =====
CREATE OR REPLACE FUNCTION public.sched_options(_user uuid, _s public.service_type) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sub public.subscriptions; ln jsonb; cad text; sz smallint; zip text; budget numeric; bk public.customer_bookings;
        c public.pro_day_claims; w text; fd date; wins jsonb; opts jsonb := '[]'::jsonb; t record;
BEGIN
  SELECT s.* INTO sub FROM public.subscriptions s
   WHERE s.user_id = _user AND s.status = 'active' AND s.plan_lines @> jsonb_build_array(jsonb_build_object('service', _s::text))
   ORDER BY s.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'no_plan'); END IF;
  SELECT x INTO ln FROM jsonb_array_elements(sub.plan_lines) x WHERE x->>'service' = _s::text LIMIT 1;
  cad := coalesce(ln->>'cadence', 'monthly'); sz := NULLIF(ln->>'size_tier','')::smallint;
  SELECT p.zip INTO zip FROM public.profiles p WHERE p.user_id = _user;
  IF zip IS NULL THEN SELECT r.zip INTO zip FROM public.reservations r WHERE r.user_id = _user ORDER BY r.created_at DESC LIMIT 1; END IF;
  zip := left(coalesce(zip, ''), 5);
  budget := public.sched_budget(_s, sz, public.sched_std_kind(_s));
  SELECT * INTO bk FROM public.customer_bookings WHERE subscription_id = sub.id AND service = _s AND status = 'active';
  FOR c IN SELECT * FROM public.pro_day_claims WHERE service = _s AND zip = zip AND status = 'active' ORDER BY weekday LOOP
    CONTINUE WHEN NOT public.sched_pro_active(c.pro_user_id);
    wins := '[]'::jsonb;
    IF NOT EXISTS (SELECT 1 FROM public.sched_waitlist q WHERE q.service = _s AND q.zip = zip AND q.status = 'offered'
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
  RETURN jsonb_build_object('service', _s, 'zip', zip, 'cadence', cad, 'size_tier', sz, 'budget_hours', budget, 'subscription_id', sub.id,
    'launch_date', public.sched_launch_date(),
    'booking', CASE WHEN bk.id IS NULL THEN NULL ELSE jsonb_build_object('id', bk.id, 'weekday', bk.weekday, 'day', public.sched_day_name(bk.weekday),
        'window', bk.window_key, 'first_visit_date', bk.first_visit_date,
        'pro_first_name', (SELECT public.sched_pro_first_name(pro_user_id) FROM public.pro_day_claims WHERE id = bk.claim_id),
        'losing_day', (SELECT drop_effective FROM public.pro_day_claims WHERE id = bk.claim_id AND status = 'dropping')) END,
    'options', opts,
    'waitlist', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'kind', q.kind, 'weekday', q.weekday, 'status', q.status,
        'offer_weekday', q.offer_weekday, 'hold_until', q.hold_until)), '[]'::jsonb)
       FROM public.sched_waitlist q WHERE q.user_id = _user AND q.service = _s AND q.status IN ('waiting','offered')));
END $$;

CREATE OR REPLACE FUNCTION public.sched_waitlist_offer(_s public.service_type, _zip text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.sched_waitlist; o jsonb; opt jsonb; wd int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sched_waitlist WHERE service = _s AND zip = _zip AND status = 'offered' AND hold_until > now()) THEN RETURN; END IF;
  FOR q IN SELECT * FROM public.sched_waitlist WHERE service = _s AND zip = _zip AND status = 'waiting' ORDER BY created_at, id LOOP
    o := public.sched_options(q.user_id, _s);
    CONTINUE WHEN o ? 'error';
    wd := NULL;
    FOR opt IN SELECT * FROM jsonb_array_elements(o->'options') LOOP
      IF NOT (opt->>'full')::boolean AND (q.weekday IS NULL OR (opt->>'weekday')::int = q.weekday) THEN wd := (opt->>'weekday')::int; EXIT; END IF;
    END LOOP;
    CONTINUE WHEN wd IS NULL;
    UPDATE public.sched_waitlist SET status = 'offered', offer_weekday = wd, offered_at = now(), hold_until = now() + interval '48 hours' WHERE id = q.id;
    PERFORM public.sched_customer_notice(q.user_id, 'waitlist_offer', 'A spot opened for you',
      format('A %s %s spot opened in %s. It''s held for you for 48 hours — choose it in your Tidy schedule.', public.sched_day_name(wd), public.sched_svc_label(_s), _zip),
      'wl-offer-' || q.id, NULL,
      format('Tidy: a %s %s spot opened. It''s held for you for 48 hours — choose it in your Tidy schedule.', public.sched_day_name(wd), public.sched_svc_label(_s)),
      now() + interval '48 hours');
    RETURN;
  END LOOP;
END $$;

-- ===== day loss =====
CREATE OR REPLACE FUNCTION public.sched_day_loss(_claim uuid, _effective date, _reason text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims; b public.customer_bookings; n int := 0;
BEGIN
  UPDATE public.pro_day_claims SET status = 'dropping', drop_effective = _effective, drop_reason = _reason
   WHERE id = _claim AND status IN ('active','pending','dropping') RETURNING * INTO c;
  IF NOT FOUND THEN RETURN 0; END IF;
  FOR b IN SELECT * FROM public.customer_bookings WHERE claim_id = _claim AND status = 'active' LOOP
    n := n + 1;
    INSERT INTO public.reschedule_items (booking_id, claim_id, kind, reason, details, dedupe_key)
    VALUES (b.id, _claim, 'day_loss', _reason, jsonb_build_object('effective', _effective, 'user_id', b.user_id, 'service', b.service, 'zip', b.zip, 'weekday', b.weekday),
            'dayloss-' || b.id || '-' || _claim) ON CONFLICT (dedupe_key) DO NOTHING;
    PERFORM public.sched_customer_notice(b.user_id, 'day_change_needed', 'Please choose a new day',
      format('From %s your %s %s day is no longer available. Choose another day in your Tidy schedule before then.', public.sched_fmt(_effective), public.sched_day_name(b.weekday), public.sched_svc_label(b.service)),
      'dayloss-' || b.id || '-' || _claim, NULL,
      format('Tidy: from %s your %s %s day changes. Pick a new day in your Tidy schedule, or reply and we''ll help.', public.sched_fmt(_effective), public.sched_day_name(b.weekday), public.sched_svc_label(b.service)),
      (_effective::timestamp) AT TIME ZONE 'America/New_York');
  END LOOP;
  IF n > 0 THEN
    PERFORM public.sched_alert('schedule_day_loss', format('%s customers need a new %s day in %s', n, public.sched_svc_label(c.service), c.zip),
      format('%s %s in %s ends %s (%s). Affected customers are listed in Reschedules.', public.sched_svc_label(c.service), public.sched_day_name(c.weekday), c.zip, public.sched_fmt(_effective), _reason),
      'action', '/admin/reschedules', 'dayloss-' || _claim || '-' || _effective);
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.sched_pro_went_inactive(_claim uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; today date := public.sched_today();
BEGIN
  FOR v IN SELECT id, visit_date FROM public.visits WHERE claim_id = _claim AND status::text = 'scheduled' AND visit_date BETWEEN today AND today + 2 LOOP
    INSERT INTO public.reschedule_items (visit_id, claim_id, kind, reason, details, dedupe_key)
    VALUES (v.id, _claim, 'inactive_pro', 'Pro is no longer active', jsonb_build_object('date', v.visit_date), 'inactive-' || v.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;
  PERFORM public.sched_day_loss(_claim, today + 3, 'pro_inactive');
  PERFORM public.sched_alert('schedule_pro_inactive', 'A Pro with booked days is no longer active',
    'Their days stopped taking new bookings. Visits in the next 48 hours are in Reschedules.', 'critical', '/admin/reschedules', 'inactive-claim-' || _claim);
END $$;

CREATE OR REPLACE FUNCTION public.sched_sync_pro(_uid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF public.sched_pro_active(_uid) THEN
    FOR c IN UPDATE public.pro_day_claims SET status = 'active', activated_at = now() WHERE pro_user_id = _uid AND status = 'pending' RETURNING * LOOP
      PERFORM public.sched_pro_notice(_uid, 'claim_live', format('Your %s in %s is live', public.sched_day_name(c.weekday), c.zip),
        'Customers can now book this day.', '/pro/schedule', 'claim-live-' || c.id);
      PERFORM public.sched_waitlist_offer(c.service, c.zip);
    END LOOP;
  ELSE
    FOR c IN SELECT * FROM public.pro_day_claims WHERE pro_user_id = _uid AND status = 'active' LOOP
      PERFORM public.sched_pro_went_inactive(c.id);
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sched_pipeline_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  SELECT contractor_id INTO uid FROM public.applicants WHERE id = NEW.applicant_id;
  BEGIN
    PERFORM public.sched_sync_pro(uid);
  EXCEPTION WHEN others THEN
    PERFORM public.sched_alert('schedule_sync_failed', 'Schedule sync failed for a Pro', SQLERRM, 'warning', '/admin/calendar', 'sync-' || NEW.applicant_id || '-' || now()::date);
  END;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pipeline_sched_sync AFTER UPDATE ON public.contractor_pipeline FOR EACH ROW
  WHEN (OLD.stage IS DISTINCT FROM NEW.stage OR OLD.archived IS DISTINCT FROM NEW.archived OR OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.sched_pipeline_sync();

-- ===== routes / pivot ladder =====
CREATE OR REPLACE FUNCTION public.sched_routes() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.service_type; z text; cap numeric; booked numeric; util numeric; wl int; out jsonb := '[]'::jsonb; today date := public.sched_today();
BEGIN
  FOREACH s IN ARRAY ARRAY['cleaning','lawn','detailing']::public.service_type[] LOOP
    FOREACH z IN ARRAY public.sched_zips() LOOP
      SELECT coalesce(sum(public.sched_claim_hours(c, d) * 0.80), 0) INTO cap
        FROM public.pro_day_claims c CROSS JOIN generate_series(today, today + 27, interval '1 day') g(dd), LATERAL (SELECT g.dd::date AS d) x
       WHERE c.service = s AND c.zip = z AND public.sched_claim_live_on(c, x.d) AND c.weekday = public.sched_dow(x.d) AND NOT public.sched_blocked(s, z, x.d);
      SELECT coalesce(sum(coalesce(budget_hours,0)), 0) INTO booked FROM public.visits
       WHERE service = s AND zip = z AND claim_id IS NOT NULL AND visit_date BETWEEN today AND today + 27 AND status::text NOT IN ('canceled','skipped');
      SELECT count(*) INTO wl FROM public.sched_waitlist WHERE service = s AND zip = z AND status IN ('waiting','offered');
      util := CASE WHEN cap > 0 THEN booked / cap WHEN booked > 0 OR wl > 0 THEN 1 ELSE 0 END;
      out := out || jsonb_build_object('service', s, 'zip', z, 'capacity_hours', round(cap, 1), 'booked_hours', round(booked, 1),
        'utilisation', round(util, 3), 'state', CASE WHEN util >= 1 THEN 'FULL' WHEN util >= 0.85 THEN 'ACT' ELSE 'OPEN' END, 'waitlist', wl,
        'open_unclaimed', (SELECT coalesce(jsonb_agg(sd.weekday ORDER BY sd.weekday), '[]'::jsonb) FROM public.service_days sd
                             WHERE sd.service = s AND sd.zip = z AND sd.active AND sd.close_effective IS NULL
                               AND NOT EXISTS (SELECT 1 FROM public.pro_day_claims c2 WHERE c2.service = s AND c2.zip = z AND c2.weekday = sd.weekday AND c2.status <> 'ended')));
    END LOOP;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.sched_ladder() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; s public.service_type; z text; pct int; sd public.service_days; wd int; pro uuid; today date := public.sched_today(); spec text;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(public.sched_routes()) LOOP
    s := (r->>'service')::public.service_type; z := r->>'zip'; pct := round((r->>'utilisation')::numeric * 100);
    -- Loudest alert: waitlist demand while a served day sits unclaimed.
    IF (r->>'waitlist')::int > 0 AND jsonb_array_length(r->'open_unclaimed') > 0 THEN
      PERFORM public.sched_alert('schedule_waitlist_open_day', format('%s waiting for %s in %s — and a day is unclaimed', r->>'waitlist', public.sched_svc_label(s), z),
        'Customers are on the waitlist while an open service day has no Pro. Get it claimed or hire for it.', 'critical', '/admin/calendar', 'wl-open-' || s || '-' || z || '-' || today);
    END IF;
    CONTINUE WHEN (r->>'utilisation')::numeric < 0.85;
    -- A: an open day nobody has claimed (opened within 3 days) -> tell the Pros.
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
    -- C: a day was opened 3+ days ago and nobody claimed it -> hire for exactly that day.
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
    -- B: no open days, but another weekday could be served -> suggest opening it.
    SELECT w INTO wd FROM generate_series(1, 6) w WHERE NOT EXISTS (SELECT 1 FROM public.service_days x WHERE x.service = s AND x.zip = z AND x.weekday = w AND x.active) ORDER BY w LIMIT 1;
    IF wd IS NOT NULL THEN
      PERFORM public.sched_alert('schedule_ladder_b', format('%s in %s is at %s%%. Open %s for %s?', public.sched_svc_label(s), z, pct, public.sched_day_name(wd), z),
        'One tap opens it as a service day; it then appears as OPEN to Pros.', 'action',
        format('/admin/calendar?open=%s:%s:%s', s, z, wd), 'ladderB-' || s || '-' || z || '-' || today);
    END IF;
  END LOOP;
END $$;

-- ===== hourly tick =====
CREATE OR REPLACE FUNCTION public.sched_tick() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.pro_day_claims; b public.customer_bookings; q record; v record; uid uuid; today date := public.sched_today();
        hr int := extract(hour FROM now() AT TIME ZONE 'America/New_York')::int; n_drop int := 0;
BEGIN
  -- Pro activation / deactivation (stage 7 + insurance) — catches COI lapses too.
  FOR uid IN SELECT DISTINCT pro_user_id FROM public.pro_day_claims WHERE status IN ('pending','active') LOOP
    PERFORM public.sched_sync_pro(uid);
  END LOOP;
  -- Shortened hours take effect.
  UPDATE public.pro_day_claims SET start_time = pending_start, end_time = pending_end, pending_start = NULL, pending_end = NULL, hours_effective = NULL
   WHERE hours_effective IS NOT NULL AND hours_effective <= today AND pending_start IS NOT NULL;
  -- Drops that reached their effective date.
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
    -- The day returns to OPEN for every Pro in that service.
    IF EXISTS (SELECT 1 FROM public.service_days WHERE service = c.service AND zip = c.zip AND weekday = c.weekday AND active AND close_effective IS NULL) THEN
      FOR uid IN SELECT DISTINCT a.contractor_id FROM public.applicants a WHERE a.contractor_id IS NOT NULL AND a.contractor_id <> c.pro_user_id AND c.service = ANY(public.sched_pro_services(a.contractor_id)) LOOP
        PERFORM public.sched_pro_notice(uid, 'open_day', format('%s in %s is open', public.sched_day_name(c.weekday), c.zip),
          format('%s in %s is open — claim it in your schedule.', public.sched_day_name(c.weekday), c.zip), '/pro/schedule', 'reopen-' || c.id || '-' || uid);
      END LOOP;
    END IF;
  END LOOP;
  UPDATE public.service_days SET active = false, closed_at = now() WHERE active AND close_effective IS NOT NULL AND close_effective <= today;
  -- Drop reminders at 7 days and 1 day.
  FOR c IN SELECT * FROM public.pro_day_claims WHERE status = 'dropping' AND drop_effective - today IN (7, 1) LOOP
    PERFORM public.sched_pro_notice(c.pro_user_id, 'drop_reminder', format('%s in %s ends %s', public.sched_day_name(c.weekday), c.zip, public.sched_fmt(c.drop_effective)),
      format('Your last %s in %s is before %s.', public.sched_day_name(c.weekday), c.zip, public.sched_fmt(c.drop_effective)), '/pro/schedule', 'drop-rem-' || c.id || '-' || (c.drop_effective - today));
  END LOOP;
  -- Waitlist holds expire; offer the next person.
  FOR q IN UPDATE public.sched_waitlist SET status = 'expired' WHERE status = 'offered' AND hold_until <= now() RETURNING service, zip LOOP
    PERFORM public.sched_waitlist_offer(q.service, q.zip);
  END LOOP;
  FOR q IN SELECT DISTINCT service, zip FROM public.sched_waitlist WHERE status = 'waiting' LOOP
    PERFORM public.sched_waitlist_offer(q.service, q.zip);
  END LOOP;
  -- Night-before customer reminder (5 pm ET; texts still pass the quiet-hours guard).
  IF hr = 17 THEN
    FOR v IN SELECT id, user_id, service, time_window, scheduled_start FROM public.visits WHERE visit_date = today + 1 AND booking_id IS NOT NULL AND status::text = 'scheduled' LOOP
      PERFORM public.sched_customer_notice(v.user_id, 'visit_reminder', 'Your Tidy visit is tomorrow',
        format('Reminder: your Tidy %s visit is tomorrow, %s.', lower(public.sched_svc_label(v.service)), coalesce(v.time_window, '')),
        'remind-' || v.id, v.id, format('Tidy reminder: your %s visit is tomorrow, %s.', lower(public.sched_svc_label(v.service)), coalesce(v.time_window, '')), v.scheduled_start);
    END LOOP;
  END IF;
  -- Pivot ladder once a day.
  IF public.sched_once('ladder-' || today) THEN PERFORM public.sched_ladder(); END IF;
  RETURN jsonb_build_object('drops_processed', n_drop);
END $$;

DO $$ DECLARE f text; BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'sched\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

SELECT cron.schedule('schedule-tick-hourly', '40 * * * *', $$SELECT public.sched_tick();$$);