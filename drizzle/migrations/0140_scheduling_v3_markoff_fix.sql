CREATE OR REPLACE FUNCTION public.pro_mark_off(_date date, _note text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := public.sched_me_pro(); today date := public.sched_today(); v_kind text; v record; moved int := 0; queued int := 0; r text; n60 int;
BEGIN
  IF _date < today THEN RAISE EXCEPTION 'date_passed'; END IF;
  -- Inside 14 days = call-off (counted). 14+ days out = planned time off (not counted).
  v_kind := CASE WHEN _date < today + 14 THEN 'call_off' ELSE 'time_off' END;
  INSERT INTO public.pro_date_exceptions (pro_user_id, off_date, kind, note) VALUES (uid, _date, v_kind, left(_note, 300))
  ON CONFLICT (pro_user_id, off_date) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'already_off'; END IF;
  FOR v IN SELECT id FROM public.visits WHERE assigned_pro_id = uid AND visit_date = _date AND status::text = 'scheduled' ORDER BY scheduled_start LOOP
    r := public.sched_relocate_visit(v.id, v_kind);
    IF r = 'moved' THEN moved := moved + 1; ELSIF r = 'queued' THEN queued := queued + 1; END IF;
  END LOOP;
  IF v_kind = 'call_off' THEN
    SELECT count(*) INTO n60 FROM public.pro_date_exceptions e WHERE e.pro_user_id = uid AND e.kind = 'call_off' AND e.created_at > now() - interval '60 days';
    IF n60 > 2 THEN
      PERFORM public.sched_alert('schedule_calloffs', format('%s has called off %s times in 60 days', public.sched_pro_first_name(uid), n60),
        'More than 2 call-offs in 60 days.', 'critical', '/admin/reschedules', 'calloffs-' || uid || '-' || today);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', v_kind, 'moved', moved, 'queued', queued);
END $$;