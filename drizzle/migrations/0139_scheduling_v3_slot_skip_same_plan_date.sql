DROP FUNCTION public.sched_find_slot(uuid, public.service_type, text, date, text, numeric, uuid);
CREATE OR REPLACE FUNCTION public.sched_find_slot(_pro uuid, _s public.service_type, _zip text, _d date, _w text, _budget numeric, _excl uuid, _sub uuid DEFAULT NULL,
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
    CONTINUE WHEN _sub IS NOT NULL AND EXISTS (SELECT 1 FROM public.visits v WHERE v.subscription_id = _sub AND v.service = _s AND v.visit_date = c AND v.id IS DISTINCT FROM _excl);
    FOREACH w IN ARRAY ws LOOP
      IF _s::text = 'cleaning' AND EXISTS (SELECT 1 FROM public.visits v WHERE v.assigned_pro_id = _pro AND v.visit_date = c AND v.service::text = 'cleaning'
           AND v.window_key = w AND v.id IS DISTINCT FROM _excl AND v.status::text NOT IN ('canceled','skipped')) THEN CONTINUE; END IF;
      slot_date := c; slot_window := w; RETURN;
    END LOOP;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.sched_find_slot(uuid, public.service_type, text, date, text, numeric, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sched_relocate_visit(_visit uuid, _reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits; s record; budget numeric;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND OR v.status::text NOT IN ('scheduled') THEN RETURN 'skipped'; END IF;
  budget := coalesce(v.budget_hours, public.sched_budget(v.service, v.size_tier, v.visit_kind));
  IF v.assigned_pro_id IS NOT NULL THEN
    SELECT * INTO s FROM public.sched_find_slot(v.assigned_pro_id, v.service, v.zip, v.visit_date, v.window_key, budget, v.id, v.subscription_id);
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
    SELECT * INTO s FROM public.sched_find_slot(c.pro_user_id, b.service, b.zip, _anchor, b.window_key, budget, NULL, b.subscription_id);
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
REVOKE ALL ON FUNCTION public.sched_relocate_visit(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sched_place_visit(uuid, date, text, int, boolean) FROM PUBLIC, anon, authenticated;