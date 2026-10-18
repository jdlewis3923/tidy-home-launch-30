-- HIRING v5 gaps: inbound SMS support, dry-run outbox, meeting location, scheduler timing.

-- 1. Candidate revival + confirmation tracking
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS archived_from_stage text;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamptz;
ALTER TABLE public.hiring_slots ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- 2. Unmatched inbound texts (unknown numbers)
CREATE TABLE IF NOT EXISTS public.unmatched_texts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_phone text NOT NULL,
  body text NOT NULL,
  twilio_sid text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.unmatched_texts TO authenticated;
GRANT ALL ON public.unmatched_texts TO service_role;
ALTER TABLE public.unmatched_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY unmatched_texts_admin ON public.unmatched_texts FOR ALL TO authenticated
  USING (public.current_user_admin()) WITH CHECK (public.current_user_admin());

-- 3. Settings: SMS dry-run toggle + private in-person meeting location (jsonb values)
INSERT INTO public.app_settings (key, value) VALUES
  ('sms_dry_run', '"off"'::jsonb),
  ('hiring_inperson_location', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. hiring_tick: run 15-min 8 AM–9 PM ET, hourly overnight; record stage at archive.
CREATE OR REPLACE FUNCTION public.hiring_tick() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; dow int; et_now timestamp; et_hour int; et_min int;
BEGIN
  et_now := now() AT TIME ZONE 'America/New_York';
  et_hour := extract(hour FROM et_now)::int;
  et_min := extract(minute FROM et_now)::int;
  -- Overnight (9 PM–8 AM ET): only the top-of-hour run does work. Deadlines that
  -- pass overnight are picked up by the first run after 8 AM.
  IF (et_hour >= 21 OR et_hour < 8) AND et_min >= 15 THEN
    RETURN 0;
  END IF;

  PERFORM public.hiring_seed_slots();
  dow := extract(isodow FROM et_now::date)::int;

  -- 1. Nudges (max 1 per deadline)
  FOR r IN SELECT d.id, d.applicant_id, d.kind FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.resolved_at IS NULL AND d.nudged_at IS NULL AND d.nudge_at IS NOT NULL AND d.nudge_at <= now()
      AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET nudged_at = now() WHERE id = r.id;
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'nudge', 'step', r.kind));
    n := n + 1;
  END LOOP;

  -- 2. Misses → archive with the reason + close-out text
  FOR r IN SELECT d.id, d.applicant_id, d.kind, p.stage FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.resolved_at IS NULL AND d.due_at <= now() AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET resolved_at = now() WHERE id = r.id;
    PERFORM set_config('tidy.pipeline_move', 'on', true);
    UPDATE public.contractor_pipeline SET archived = true, archived_at = now(), state = 'declined',
      archived_from_stage = r.stage,
      archive_reason = CASE r.kind
        WHEN 'apply' THEN 'no_apply' WHEN 'proof' THEN 'no_proof' WHEN 'book_phone' THEN 'no_booking'
        WHEN 'phone_slot' THEN 'no_show_phone' WHEN 'confirm_inperson' THEN 'no_confirm'
        WHEN 'inperson_slot' THEN 'no_show_interview' WHEN 'sign' THEN 'no_sign'
        WHEN 'checkr_consent' THEN 'no_bg_consent' WHEN 'coi' THEN 'no_coi' ELSE r.kind END,
      decline_reason = 'Unresponsive'
     WHERE applicant_id = r.applicant_id;
    PERFORM public.pipeline_log(r.applicant_id, 'decline', NULL, NULL, 'open', 'declined', 'silence: ' || r.kind, jsonb_build_object('archive_reason', r.kind));
    PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'close_out'));
    n := n + 1;
  END LOOP;

  -- 3. Slot reminders: phone 24 h + 2 h before; in-person 24 h + morning of (8 AM ET)
  FOR r IN SELECT s.id, s.applicant_id, s.kind, s.starts_at FROM public.hiring_slots s
     JOIN public.contractor_pipeline p ON p.applicant_id = s.applicant_id
    WHERE s.status = 'booked' AND s.applicant_id IS NOT NULL AND NOT p.archived AND NOT p.is_test
      AND s.starts_at > now()
  LOOP
    IF r.starts_at - now() <= interval '24 hours' AND r.starts_at - now() > interval '23 hours' THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    ELSIF r.kind = 'phone' AND r.starts_at - now() <= interval '2 hours' AND r.starts_at - now() > interval '1 hour' THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    ELSIF r.kind = 'in_person' AND (et_now::time BETWEEN time '08:00' AND time '08:15')
       AND (r.starts_at AT TIME ZONE 'America/New_York')::date = et_now::date THEN
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'slot_reminder', 'slot', r.id));
      n := n + 1;
    END IF;
  END LOOP;

  -- 4. Weekly check-in: Mondays 6 PM ET, stages agreement/background/insured (signed, not yet active)
  IF dow = 1 AND et_now::time BETWEEN time '18:00' AND time '18:15' THEN
    FOR r IN SELECT p.applicant_id FROM public.contractor_pipeline p
       WHERE p.stage IN ('agreement','background','insured') AND NOT p.archived AND NOT p.is_test AND p.state = 'open'
         AND (p.last_checkin_sent_at IS NULL OR p.last_checkin_sent_at < now() - interval '6 days')
    LOOP
      UPDATE public.contractor_pipeline SET last_checkin_sent_at = now() WHERE applicant_id = r.applicant_id;
      PERFORM public.hiring_set_deadline(r.applicant_id, 'checkin', now() + interval '24 hours', NULL);
      PERFORM public.call_edge_function('pipeline-notify', jsonb_build_object('applicant_id', r.applicant_id, 'event', 'weekly_checkin'));
      n := n + 1;
    END LOOP;
  END IF;

  -- 5. Check-in no reply in 24 h → URGENT; two misses → URGENT + bench note
  FOR r IN SELECT d.applicant_id FROM public.hiring_deadlines d
     JOIN public.contractor_pipeline p ON p.applicant_id = d.applicant_id
    WHERE d.kind = 'checkin' AND d.resolved_at IS NULL AND d.due_at <= now() AND NOT p.archived AND NOT p.is_test
  LOOP
    UPDATE public.hiring_deadlines SET resolved_at = now() WHERE applicant_id = r.applicant_id AND kind = 'checkin' AND resolved_at IS NULL;
    UPDATE public.contractor_pipeline SET checkin_missed_count = checkin_missed_count + 1 WHERE applicant_id = r.applicant_id;
    INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key, context)
    SELECT 'hiring_checkin_missed', 'critical', 'hiring',
      'Call ' || trim(coalesce(a.first_name,'')) || ' today',
      CASE WHEN p.checkin_missed_count + 1 >= 2
        THEN 'Two weekly check-ins missed. Consider offering the seat to bench #2 for this service (spend lock override reason: "seat lead silent").'
        ELSE 'No reply to the weekly check-in within 24 hours.' END,
      'Open candidate', '/admin/pipeline/' || r.applicant_id,
      'checkin_missed:' || r.applicant_id || ':' || (p.checkin_missed_count + 1),
      jsonb_build_object('applicant_id', r.applicant_id, 'missed', p.checkin_missed_count + 1)
    FROM public.applicants a, public.contractor_pipeline p
    WHERE a.id = r.applicant_id AND p.applicant_id = r.applicant_id
    ON CONFLICT (dedupe_key) DO NOTHING;
    n := n + 1;
  END LOOP;

  RETURN n;
END $$;