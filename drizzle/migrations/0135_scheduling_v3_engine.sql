-- ===== visit triggers =====
CREATE OR REPLACE FUNCTION public.sched_visit_booking_fill() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.customer_bookings; c public.pro_day_claims; t record; v_bid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.booking_id IS NULL AND NEW.subscription_id IS NOT NULL AND NOT coalesce(NEW.is_redo, false)
       AND coalesce(NEW.visit_kind, '') <> 'car_wash' AND NEW.service IS NOT NULL THEN
      SELECT id INTO v_bid FROM public.customer_bookings WHERE subscription_id = NEW.subscription_id AND service = NEW.service AND status = 'active' LIMIT 1;
      NEW.booking_id := v_bid;
    END IF;
    IF NEW.booking_id IS NOT NULL THEN
      SELECT * INTO b FROM public.customer_bookings WHERE id = NEW.booking_id;
      SELECT * INTO c FROM public.pro_day_claims WHERE id = b.claim_id;
      NEW.claim_id := coalesce(NEW.claim_id, b.claim_id);
      NEW.assigned_pro_id := coalesce(NEW.assigned_pro_id, c.pro_user_id);
      NEW.zip := coalesce(NEW.zip, b.zip);
      NEW.window_key := coalesce(NEW.window_key, b.window_key);
      NEW.budget_hours := coalesce(NEW.budget_hours, public.sched_budget(b.service, NEW.size_tier, coalesce(NEW.visit_kind, public.sched_std_kind(b.service))));
      NEW.gate_code := coalesce(NEW.gate_code, NULLIF(b.details->>'gate_code', ''));
      NEW.access_notes := coalesce(NEW.access_notes, NULLIF(concat_ws(' · ', NULLIF(b.details->>'gate_location',''), NULLIF(b.details->>'entry_method',''), NULLIF(b.details->>'entry_note','')), ''));
      NEW.parking_notes := coalesce(NEW.parking_notes, NULLIF(concat_ws(' · ', NULLIF(b.details->>'vehicle',''), NULLIF(b.details->>'parking_spot',''), NULLIF(b.details->>'interior_access','')), ''));
    END IF;
  END IF;
  IF NEW.booking_id IS NOT NULL AND NEW.window_key IS NOT NULL AND NEW.service IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.visit_date IS DISTINCT FROM OLD.visit_date OR NEW.window_key IS DISTINCT FROM OLD.window_key) THEN
    SELECT * INTO t FROM public.sched_window_times(NEW.service, NEW.window_key);
    NEW.time_window := t.label;
    NEW.scheduled_start := (NEW.visit_date::timestamp + make_interval(hours => t.start_h)) AT TIME ZONE 'America/New_York';
    NEW.scheduled_end := (NEW.visit_date::timestamp + make_interval(hours => t.end_h)) AT TIME ZONE 'America/New_York';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_a_booking BEFORE INSERT OR UPDATE OF visit_date, window_key ON public.visits FOR EACH ROW EXECUTE FUNCTION public.sched_visit_booking_fill();

-- Server-side guard: nothing before launch, no Sunday, never over capacity, one cleaning per window per Pro.
CREATE OR REPLACE FUNCTION public.sched_visit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cap numeric;
BEGIN
  IF coalesce(NEW.is_sample, false) OR NEW.status::text IN ('canceled','skipped') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.visit_date IS NOT DISTINCT FROM OLD.visit_date AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id
     AND NEW.budget_hours IS NOT DISTINCT FROM OLD.budget_hours AND NEW.window_key IS NOT DISTINCT FROM OLD.window_key THEN RETURN NEW; END IF;
  IF NEW.visit_date IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.visit_date IS DISTINCT FROM OLD.visit_date)
     AND NEW.visit_date < public.sched_launch_date() THEN
    RAISE EXCEPTION 'before_launch' USING DETAIL = format('No visit may be scheduled before %s.', public.sched_launch_date());
  END IF;
  IF NEW.booking_id IS NULL AND NEW.claim_id IS NULL THEN RETURN NEW; END IF;
  IF public.sched_dow(NEW.visit_date) = 7 THEN RAISE EXCEPTION 'no_sunday'; END IF;
  IF coalesce(current_setting('tidy.capacity_override', true), '') = 'on' OR NEW.assigned_pro_id IS NULL THEN RETURN NEW; END IF;
  cap := public.sched_pro_cap(NEW.assigned_pro_id, NEW.visit_date);
  IF public.sched_booked(NEW.assigned_pro_id, NEW.visit_date, NEW.id) + coalesce(NEW.budget_hours, 0) > cap + 0.0001 THEN
    RAISE EXCEPTION 'over_capacity' USING DETAIL = format('%s is full for this Pro.', NEW.visit_date);
  END IF;
  IF NEW.service::text = 'cleaning' AND EXISTS (SELECT 1 FROM public.visits v WHERE v.assigned_pro_id = NEW.assigned_pro_id AND v.visit_date = NEW.visit_date
       AND v.service::text = 'cleaning' AND v.window_key = NEW.window_key AND v.id <> NEW.id AND v.status::text NOT IN ('canceled','skipped')) THEN
    RAISE EXCEPTION 'window_taken';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_zc_capacity BEFORE INSERT OR UPDATE OF visit_date, assigned_pro_id, budget_hours, window_key ON public.visits FOR EACH ROW EXECUTE FUNCTION public.sched_visit_guard();

-- ===== moving visits =====
CREATE OR REPLACE FUNCTION public.sched_find_slot(_pro uuid, _s public.service_type, _zip text, _d date, _w text, _budget numeric, _excl uuid,
  OUT slot_date date, OUT slot_window text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE wk date; cands date[] := '{}'; cu int; wd int; c date; ws text[]; w text; today date := public.sched_today();
BEGIN
  wk := _d - (public.sched_dow(_d) - 1);
  SELECT weekday INTO cu FROM public.pro_catchup_days WHERE pro_user_id = _pro;
  IF cu IS NOT NULL THEN cands := cands || (wk + (cu - 1)); END IF;                 -- 1. catch-up day that week
  FOR wd IN SELECT DISTINCT cl.weekday FROM public.pro_day_claims cl WHERE cl.pro_user_id = _pro AND cl.service = _s AND cl.zip = _zip
            AND cl.status IN ('active','dropping') AND cl.weekday <> public.sched_dow(_d) ORDER BY 1 LOOP
    cands := cands || (wk + (wd - 1));                                               -- 2. same ZIP's other claimed day that week
  END LOOP;
  cands := cands || (_d + 1) || (_d + 2);                                            -- 3. nearest date within 48 hours
  ws := ARRAY[coalesce(_w, (public.sched_windows(_s))[1])] || array_remove(public.sched_windows(_s), coalesce(_w, (public.sched_windows(_s))[1]));
  FOREACH c IN ARRAY cands LOOP
    CONTINUE WHEN c = _d OR c <= today OR c < public.sched_launch_date() OR public.sched_dow(c) = 7;
    CONTINUE WHEN public.sched_blocked(_s, _zip, c);
    CONTINUE WHEN public.sched_pro_cap(_pro, c) <= 0;
    CONTINUE WHEN public.sched_booked(_pro, c, _excl) + _budget > public.sched_pro_cap(_pro, c) + 0.0001;
    FOREACH w IN ARRAY ws LOOP
      IF _s::text = 'cleaning' AND EXISTS (SELECT 1 FROM public.visits v WHERE v.assigned_pro_id = _pro AND v.visit_date = c AND v.service::text = 'cleaning'
           AND v.window_key = w AND v.id IS DISTINCT FROM _excl AND v.status::text NOT IN ('canceled','skipped')) THEN CONTINUE; END IF;
      slot_date := c; slot_window := w; RETURN;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sched_move_visit(_visit uuid, _to date, _w text, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits; same_window boolean; msg text; lbl text;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  same_window := coalesce(_w, v.window_key) IS NOT DISTINCT FROM v.window_key;
  UPDATE public.visits SET visit_date = _to, window_key = coalesce(_w, window_key), moved_from_date = coalesce(moved_from_date, visit_date), updated_at = now()
   WHERE id = _visit;
  INSERT INTO public.visit_moves (visit_id, from_date, to_date, reason) VALUES (_visit, v.visit_date, _to, _reason);
  IF same_window THEN
    msg := format('Your Tidy visit has moved from %s to %s — same Pro, same window. Reply if that day doesn''t work.', to_char(v.visit_date,'FMDay'), to_char(_to,'FMDay'));
  ELSE
    SELECT label INTO lbl FROM public.sched_window_times(v.service, _w);
    msg := format('Your Tidy visit has moved from %s to %s — same Pro, %s. Reply if that day doesn''t work.', to_char(v.visit_date,'FMDay'), to_char(_to,'FMDay'), lbl);
  END IF;
  IF v.user_id IS NOT NULL THEN
    PERFORM public.sched_customer_notice(v.user_id, 'visit_moved', 'Your visit has moved', msg || ' Same Pro, rescheduled within 48 hours.',
      'moved-' || _visit || '-' || _to, _visit, msg, (_to::timestamp + interval '8 hours') AT TIME ZONE 'America/New_York');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sched_relocate_visit(_visit uuid, _reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits; s record; budget numeric;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND OR v.status::text NOT IN ('scheduled') THEN RETURN 'skipped'; END IF;
  budget := coalesce(v.budget_hours, public.sched_budget(v.service, v.size_tier, v.visit_kind));
  IF v.assigned_pro_id IS NOT NULL THEN
    SELECT * INTO s FROM public.sched_find_slot(v.assigned_pro_id, v.service, v.zip, v.visit_date, v.window_key, budget, v.id);
  END IF;
  IF s.slot_date IS NULL THEN
    INSERT INTO public.reschedule_items (visit_id, booking_id, claim_id, kind, reason, details, dedupe_key)
    VALUES (_visit, v.booking_id, v.claim_id, 'unplaceable', _reason, jsonb_build_object('date', v.visit_date, 'service', v.service, 'zip', v.zip),
            'reloc-' || _visit || '-' || v.visit_date)
    ON CONFLICT (dedupe_key) DO UPDATE SET status = 'open', resolved_at = NULL;
    PERFORM public.sched_alert('schedule_unplaceable', 'A visit needs a new date', format('%s visit on %s (%s) could not be moved automatically: %s.', public.sched_svc_label(v.service), v.visit_date, coalesce(v.zip,'—'), _reason),
      'critical', '/admin/reschedules', 'unplaceable-' || _visit || '-' || v.visit_date);
    RETURN 'queued';
  END IF;
  PERFORM public.sched_move_visit(_visit, s.slot_date, s.slot_window, _reason);
  RETURN 'moved';
END $$;

-- ===== generating a booking's visits =====
CREATE OR REPLACE FUNCTION public.sched_place_visit(_b uuid, _anchor date, _kind text, _pay int, _force_move boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.customer_bookings; c public.pro_day_claims; sub public.subscriptions; target date; win text; moved date; s record; ln jsonb; sz smallint; budget numeric;
BEGIN
  SELECT * INTO b FROM public.customer_bookings WHERE id = _b;
  SELECT * INTO c FROM public.pro_day_claims WHERE id = b.claim_id;
  SELECT * INTO sub FROM public.subscriptions WHERE id = b.subscription_id;
  IF EXISTS (SELECT 1 FROM public.visits WHERE booking_id = _b AND anchor_date = _anchor AND coalesce(visit_kind,'') = _kind) THEN RETURN false; END IF;
  SELECT x INTO ln FROM jsonb_array_elements(sub.plan_lines) x WHERE x->>'service' = b.service::text LIMIT 1;
  sz := NULLIF(ln->>'size_tier','')::smallint;
  budget := public.sched_budget(b.service, sz, _kind);
  target := _anchor; win := b.window_key; moved := NULL;
  IF _force_move OR public.sched_blocked(b.service, b.zip, _anchor)
     OR EXISTS (SELECT 1 FROM public.pro_date_exceptions WHERE pro_user_id = c.pro_user_id AND off_date = _anchor) THEN
    SELECT * INTO s FROM public.sched_find_slot(c.pro_user_id, b.service, b.zip, _anchor, b.window_key, budget, NULL);
    IF s.slot_date IS NULL THEN
      INSERT INTO public.reschedule_items (booking_id, claim_id, kind, reason, details, dedupe_key)
      VALUES (_b, b.claim_id, 'unplaceable', 'No room to place this visit', jsonb_build_object('date', _anchor, 'kind', _kind, 'service', b.service, 'zip', b.zip),
              'gen-' || _b || '-' || _anchor || '-' || _kind) ON CONFLICT (dedupe_key) DO NOTHING;
      RETURN false;
    END IF;
    target := s.slot_date; win := s.slot_window;
    IF NOT _force_move THEN moved := _anchor; END IF;
  END IF;
  BEGIN
    INSERT INTO public.visits (user_id, subscription_id, service, service_type, visit_date, status, size_tier, cadence, surcharge_applied,
      contractor_pay_cents, visit_kind, booking_id, claim_id, window_key, budget_hours, anchor_date, moved_from_date)
    VALUES (b.user_id, b.subscription_id, b.service, b.service::text, target, 'scheduled', sz, coalesce(ln->>'cadence', b.cadence),
      coalesce((ln->>'surcharge_applied')::boolean, false), _pay, _kind, _b, b.claim_id, win, budget, _anchor, moved)
    ON CONFLICT DO NOTHING;
    RETURN FOUND;
  EXCEPTION WHEN others THEN
    INSERT INTO public.reschedule_items (booking_id, claim_id, kind, reason, details, dedupe_key)
    VALUES (_b, b.claim_id, 'unplaceable', SQLERRM, jsonb_build_object('date', target, 'kind', _kind, 'service', b.service, 'zip', b.zip),
            'gen-' || _b || '-' || _anchor || '-' || _kind) ON CONFLICT (dedupe_key) DO NOTHING;
    RETURN false;
  END;
END $$;

CREATE OR REPLACE FUNCTION public.sched_generate_booking(_b uuid, _until date) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.customer_bookings; sub public.subscriptions; ln jsonb; sz smallint; cad text; surch boolean; kind text; pay int; xpay int;
        d date; idx int := 0; made int := 0; stop date; today date := public.sched_today(); k int; ms date;
BEGIN
  SELECT * INTO b FROM public.customer_bookings WHERE id = _b AND status = 'active';
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT * INTO sub FROM public.subscriptions WHERE id = b.subscription_id;
  IF sub.status::text <> 'active' THEN RETURN 0; END IF;
  SELECT x INTO ln FROM jsonb_array_elements(sub.plan_lines) x WHERE x->>'service' = b.service::text LIMIT 1;
  sz := NULLIF(ln->>'size_tier','')::smallint; cad := coalesce(ln->>'cadence', b.cadence); surch := coalesce((ln->>'surcharge_applied')::boolean, false);
  stop := CASE WHEN sub.cancel_at_period_end AND sub.next_billing_date IS NOT NULL THEN least(_until, sub.next_billing_date - 1) ELSE _until END;
  kind := public.sched_std_kind(b.service);
  pay := coalesce(public.contractor_visit_pay_cents(b.service::text, sz, cad, NULL, surch, kind), NULLIF(ln->>'contractor_pay_cents','')::int);
  FOR d IN SELECT public.sched_dates(b.service, b.cadence, b.first_visit_date, stop, 1000) LOOP
    IF d >= today AND d >= public.sched_launch_date() THEN
      IF public.sched_place_visit(_b, d, kind, pay, false) THEN made := made + 1; END IF;
      -- weekly cleaning: quarterly deep clean every 13th week, placed off the regular day (catch-up first)
      IF b.service::text = 'cleaning' AND b.cadence = 'weekly' AND idx % 13 = 0 THEN
        xpay := public.contractor_visit_pay_cents('cleaning', sz, 'monthly', NULL, surch, 'quarterly_deep_clean');
        IF public.sched_place_visit(_b, d, 'quarterly_deep_clean', xpay, true) THEN made := made + 1; END IF;
      END IF;
    END IF;
    idx := idx + 1;
  END LOOP;
  IF b.service::text = 'detailing' THEN
    xpay := public.contractor_visit_pay_cents('detailing', sz, 'monthly', NULL, false, 'full_detail');
    FOR k IN 0..24 LOOP
      ms := public.sched_month_anchor(b.first_visit_date, k);
      EXIT WHEN ms > stop;
      IF k % 6 = 0 AND ms + 14 >= today AND ms + 14 <= stop AND ms + 14 >= public.sched_launch_date() THEN
        IF public.sched_place_visit(_b, ms + 14, 'full_detail', xpay, false) THEN made := made + 1; END IF;
      END IF;
    END LOOP;
  END IF;
  RETURN made;
END $$;

-- The generator now builds visits only from a customer's chosen day.
CREATE OR REPLACE FUNCTION public.generate_recurring_visits(_subscription_id uuid DEFAULT NULL::uuid, _horizon_days integer DEFAULT 45)
RETURNS TABLE(out_subscription_id uuid, out_service text, out_created integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s record; l record; v_b uuid; v_limit date;
BEGIN
  IF NOT (public.is_privileged_caller()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_limit := public.sched_today() + GREATEST(_horizon_days, 1);
  FOR s IN SELECT sub.* FROM public.subscriptions sub
    WHERE sub.status = 'active' AND (_subscription_id IS NULL OR sub.id = _subscription_id)
      AND jsonb_typeof(sub.plan_lines) = 'array' AND jsonb_array_length(sub.plan_lines) > 0
  LOOP
    FOR l IN SELECT DISTINCT x->>'service' AS service FROM jsonb_array_elements(s.plan_lines) x WHERE x->>'service' IN ('cleaning','lawn','detailing') LOOP
      SELECT id INTO v_b FROM public.customer_bookings WHERE subscription_id = s.id AND service = l.service::public.service_type AND status = 'active';
      out_subscription_id := s.id; out_service := l.service;
      out_created := CASE WHEN v_b IS NULL THEN 0 ELSE public.sched_generate_booking(v_b, v_limit) END;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

DO $$ DECLARE f text; BEGIN
  FOR f IN SELECT p.oid::regprocedure::text FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'sched\_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;