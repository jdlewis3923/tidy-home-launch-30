-- Sprint mode: 24h deadlines with 12h nudges, auto-off Thu Oct 29 2026 11:59 PM ET.
CREATE OR REPLACE FUNCTION public.hiring_sprint_active()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  SELECT value INTO v FROM public.app_settings WHERE key = 'hiring_sprint_mode';
  IF v IS NULL OR NOT coalesce((v->>'on')::boolean, false) THEN RETURN false; END IF;
  IF v->>'until' IS NOT NULL AND now() > (v->>'until')::timestamptz THEN RETURN false; END IF;
  RETURN true;
END $$;

-- Admin toggle: turns sprint on/off; turning on compresses every open deadline
-- to 24h (nudge at 12h) from now.
CREATE OR REPLACE FUNCTION public.hiring_sprint_set(_on boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE compressed int := 0;
BEGIN
  IF NOT public.current_user_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.app_settings(key, value)
  VALUES ('hiring_sprint_mode', jsonb_build_object('on', _on, 'until', '2026-10-30T03:59:00+00:00', 'set_at', now()))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
  IF _on THEN
    UPDATE public.hiring_deadlines
       SET due_at = now() + interval '24 hours',
           nudge_at = CASE WHEN nudged_at IS NULL THEN now() + interval '12 hours' ELSE nudge_at END
     WHERE resolved_at IS NULL AND due_at > now() + interval '24 hours';
    GET DIAGNOSTICS compressed = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('on', _on, 'compressed', compressed);
END $$;

-- Reopen an archived candidate once, back to invited with a fresh start.
CREATE OR REPLACE FUNCTION public.hiring_reopen(_applicant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('tidy.pipeline_move', 'on', true);
  UPDATE public.contractor_pipeline
     SET archived = false, archived_at = NULL, state = 'open', stage = 'invited',
         archive_reason = NULL, decline_reason = NULL
   WHERE applicant_id = _applicant_id AND archived = true;
  IF FOUND THEN
    PERFORM public.pipeline_log(_applicant_id, 'reopen', NULL, NULL, 'archived', 'open', 'reopened by invite', NULL);
  END IF;
END $$;

-- Slot seeding: phone screens Mon-Fri 6:00-8:00 PM ET only (no Saturday);
-- in-person interviews only Wed Oct 28 + Thu Oct 29 2026, 10 AM-2 PM ET.
CREATE OR REPLACE FUNCTION public.hiring_seed_slots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE d date; ts timestamp; n int := 0;
BEGIN
  -- Phone: Mon-Fri 6:00-8:00 PM ET, every 30 min, next 5 days. No Saturdays.
  FOR d IN SELECT generate_series((now() AT TIME ZONE 'America/New_York')::date, (now() AT TIME ZONE 'America/New_York')::date + 5, '1 day'::interval)::date LOOP
    IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
      FOR ts IN SELECT generate_series(d::timestamp + time '18:00', d::timestamp + time '20:00', '30 minutes'::interval) LOOP
        INSERT INTO public.hiring_slots(kind, starts_at, duration_min, staff)
        SELECT 'phone', (ts AT TIME ZONE 'America/New_York'), 30, 'Screener'
        WHERE NOT EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.kind = 'phone' AND s.starts_at = (ts AT TIME ZONE 'America/New_York'));
        IF FOUND THEN n := n + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  -- In-person: only Wed Oct 28 and Thu Oct 29 2026, 10:00 AM-2:00 PM ET, hourly.
  FOR d IN SELECT unnest(ARRAY[date '2026-10-28', date '2026-10-29']) LOOP
    IF (now() AT TIME ZONE 'America/New_York')::date <= d THEN
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