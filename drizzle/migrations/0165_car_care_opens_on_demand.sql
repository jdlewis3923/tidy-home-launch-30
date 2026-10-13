ALTER TABLE public.launch_config
  ADD COLUMN IF NOT EXISTS car_launch_threshold integer,
  ADD COLUMN IF NOT EXISTS car_proposed_first_visit date,
  ADD COLUMN IF NOT EXISTS car_proposed_conversion date,
  ADD COLUMN IF NOT EXISTS car_proposed_at timestamptz,
  ADD COLUMN IF NOT EXISTS car_proposed_for uuid,
  ADD COLUMN IF NOT EXISTS car_threshold_reached_at timestamptz;
UPDATE public.launch_config SET car_launch_threshold = 10 WHERE scope = 'car' AND car_launch_threshold IS NULL;

ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS car_waiting boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.reservations.car_waiting IS 'Converted for cleaning/lawn while car care had no date; the car line is added to the same bill when car care opens.';

-- Null conversion date = not open (car care has no date until demand fills a route).
CREATE OR REPLACE FUNCTION public.launch_conversion_open(_scope text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT conversion_date IS NOT NULL AND (now() AT TIME ZONE 'America/New_York')::date >= conversion_date
                     FROM public.launch_config WHERE scope = _scope), false)
$$;

-- No car job of any kind while car care has no first-visit date.
CREATE OR REPLACE FUNCTION public.launch_visit_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first date; is_car boolean;
BEGIN
  IF coalesce(NEW.is_sample, false) OR NEW.visit_date IS NULL OR NEW.status::text IN ('canceled','skipped') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.visit_date IS NOT DISTINCT FROM OLD.visit_date THEN RETURN NEW; END IF;
  is_car := coalesce(NEW.service::text, '') = 'detailing' OR coalesce(NEW.service_type, '') = 'detailing'
            OR coalesce(NEW.visit_kind, '') IN ('car_wash','maintenance_wash','full_detail');
  SELECT first_visit_date INTO first FROM public.launch_config
   WHERE scope = CASE WHEN is_car THEN 'car' ELSE coalesce(NEW.service::text, NEW.service_type) END;
  IF is_car AND first IS NULL THEN
    RAISE EXCEPTION 'car_not_open' USING DETAIL = 'Car care has no start date yet; car visits cannot be scheduled.';
  END IF;
  IF first IS NOT NULL AND NEW.visit_date < first THEN
    RAISE EXCEPTION 'before_launch' USING DETAIL = format('This service starts %s.', first);
  END IF;
  RETURN NEW;
END $$;

-- A reservation can't convert while any of its non-waiting services is closed, except car, which waits (car_waiting).
CREATE OR REPLACE FUNCTION public.reservation_car_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE has_car boolean; has_home boolean;
BEGIN
  IF NEW.status NOT IN ('invited','converted') OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  has_car := 'detailing' = ANY(coalesce(NEW.services, '{}')) OR coalesce(NEW.quote->>'carWashes','') NOT IN ('','0','false','null');
  has_home := EXISTS (SELECT 1 FROM unnest(coalesce(NEW.services, '{}')) s WHERE s IN ('cleaning','lawn'));
  IF has_car AND NOT public.launch_conversion_open('car') THEN
    IF NOT has_home THEN
      RAISE EXCEPTION 'car_care_conversion_not_open' USING ERRCODE = '23514', DETAIL = 'Car care has no date yet; this reservation waits.';
    END IF;
    NEW.car_waiting := true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_reservation_car_gate ON public.reservations;
CREATE TRIGGER trg_reservation_car_gate BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.reservation_car_gate();

-- Car demand: Shine Complete + Car Wash Add-On reservations, each member (email) once.
CREATE OR REPLACE FUNCTION public.car_reservation_count() RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(DISTINCT lower(email))::int FROM public.reservations
   WHERE status <> 'canceled' AND NOT coalesce(is_test_row, false)
     AND ('detailing' = ANY(coalesce(services, '{}')) OR coalesce(quote->>'carWashes','') NOT IN ('','0','false','null'))
$$;

CREATE OR REPLACE FUNCTION public.car_launch_status() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('count', public.car_reservation_count(), 'threshold', coalesce(car_launch_threshold, 10),
    'reached_at', car_threshold_reached_at, 'proposed_first_visit', car_proposed_first_visit,
    'proposed_conversion', car_proposed_conversion, 'proposed_at', car_proposed_at,
    'first_visit_date', first_visit_date, 'conversion_date', conversion_date)
  FROM public.launch_config WHERE scope = 'car'
$$;

-- Fires once when car demand reaches the threshold: one urgent alert, holds move to trigger + 3 days.
CREATE OR REPLACE FUNCTION public.car_launch_check() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.launch_config; n int; r record;
BEGIN
  SELECT * INTO c FROM public.launch_config WHERE scope = 'car' FOR UPDATE;
  IF c.scope IS NULL OR c.car_threshold_reached_at IS NOT NULL OR c.first_visit_date IS NOT NULL THEN RETURN; END IF;
  n := public.car_reservation_count();
  IF n < coalesce(c.car_launch_threshold, 10) THEN RETURN; END IF;
  UPDATE public.launch_config SET car_threshold_reached_at = now() WHERE scope = 'car';
  INSERT INTO public.admin_alerts(alert_type, level, category, tier, title, body, action_label, action_url, dedupe_key, context)
  VALUES ('car_launch_threshold', 'critical', 'calendar', 'urgent',
    format('Car care reached %s reservations. Advance your car Pro today.', coalesce(c.car_launch_threshold, 10)),
    format('Car care reached %s reservations. Advance your car Pro today.', coalesce(c.car_launch_threshold, 10)),
    'Open the pipeline', '/admin/pipeline?service=detailing', 'car_launch_threshold', jsonb_build_object('count', n))
  ON CONFLICT (dedupe_key) DO NOTHING;
  FOR r IN SELECT p.applicant_id FROM public.contractor_pipeline p
            WHERE p.service = 'detailing' AND p.state = 'hold' AND NOT p.archived AND NOT p.is_test
              AND p.hold_callback_date = '2026-11-13'::date LOOP
    PERFORM set_config('tidy.pipeline_move', 'on', true);
    UPDATE public.contractor_pipeline SET hold_callback_date = (now() AT TIME ZONE 'America/New_York')::date + 3 WHERE applicant_id = r.applicant_id;
    PERFORM public.pipeline_log(r.applicant_id, 'hold', NULL, NULL, 'hold', 'hold', 'Callback moved: car care reached its reservation threshold');
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.car_launch_check_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN PERFORM public.car_launch_check();
  EXCEPTION WHEN others THEN
    INSERT INTO public.integration_logs(source, event, status, details) VALUES ('internal', 'car_launch_check', 'error', jsonb_build_object('error', SQLERRM));
  END;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_reservations_car_launch ON public.reservations;
CREATE TRIGGER trg_reservations_car_launch AFTER INSERT OR UPDATE OF services, quote, status ON public.reservations
  FOR EACH STATEMENT EXECUTE FUNCTION public.car_launch_check_trg();

-- First Monday at least 7 days after _from, never in Thanksgiving week.
CREATE OR REPLACE FUNCTION public.car_launch_propose_date(_from date) RETURNS date
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d date := _from + 7; tg date;
BEGIN
  d := d + ((8 - extract(isodow FROM d)::int) % 7);
  LOOP
    tg := make_date(extract(year FROM d)::int, 11, 1);
    tg := tg + ((4 - extract(isodow FROM tg)::int + 7) % 7) + 21; -- fourth Thursday
    EXIT WHEN NOT (d BETWEEN tg - 3 AND tg + 3);
    d := d + 7;
  END LOOP;
  RETURN d;
END $$;

-- A car Pro reaching Active proposes dates; nothing is set until the owner approves.
CREATE OR REPLACE FUNCTION public.car_launch_propose_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE fv date;
BEGIN
  IF NEW.service <> 'detailing' OR NEW.is_test OR NEW.archived OR NEW.stage <> 'active' OR NEW.activated_at IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.activated_at IS NOT NULL AND OLD.stage = 'active' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.launch_config WHERE scope = 'car' AND (first_visit_date IS NOT NULL OR car_proposed_at IS NOT NULL)) THEN RETURN NEW; END IF;
  fv := public.car_launch_propose_date((NEW.activated_at AT TIME ZONE 'America/New_York')::date);
  UPDATE public.launch_config SET car_proposed_first_visit = fv, car_proposed_conversion = fv - 7,
    car_proposed_at = now(), car_proposed_for = NEW.applicant_id WHERE scope = 'car';
  INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, dedupe_key)
  VALUES ('car_launch_proposed', 'action', 'calendar', 'Approve the car care start date',
    format('A car Pro is active. Proposed: conversion %s, first visits %s. Nothing changes until you approve.', fv - 7, fv),
    'Review dates', '/admin/launch-dates', 'car_launch_proposed:' || fv)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pipeline_car_launch_propose ON public.contractor_pipeline;
CREATE TRIGGER trg_pipeline_car_launch_propose AFTER INSERT OR UPDATE OF stage, activated_at ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.car_launch_propose_trg();

-- Owner approval: writes both dates through the logged path and clears the proposal.
CREATE OR REPLACE FUNCTION public.admin_approve_car_launch() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.launch_config; waiting int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO c FROM public.launch_config WHERE scope = 'car' FOR UPDATE;
  IF c.car_proposed_first_visit IS NULL THEN RAISE EXCEPTION 'no_proposal'; END IF;
  PERFORM public.admin_set_launch_config('car', 'conversion_date', c.car_proposed_conversion::text);
  PERFORM public.admin_set_launch_config('car', 'first_visit_date', c.car_proposed_first_visit::text);
  UPDATE public.launch_config SET car_proposed_first_visit = NULL, car_proposed_conversion = NULL, car_proposed_at = NULL WHERE scope = 'car';
  SELECT count(*) INTO waiting FROM public.reservations WHERE status <> 'canceled' AND NOT coalesce(is_test_row, false)
    AND (car_waiting OR 'detailing' = ANY(coalesce(services, '{}')) OR coalesce(quote->>'carWashes','') NOT IN ('','0','false','null'));
  INSERT INTO public.admin_alerts(alert_type, level, category, title, body, action_label, action_url, due_date, dedupe_key)
  VALUES ('car_launch_approved', 'action', 'calendar', format('Send car care conversion messages (%s reservations)', waiting),
    format('Car care converts %s and starts %s. Send each car reservation its conversion message; members already on a plan get the car line added to the same bill.', c.car_proposed_conversion, c.car_proposed_first_visit),
    'Open reservations', '/admin/reservations?service=detailing', c.car_proposed_conversion, 'car_launch_approved:' || c.car_proposed_first_visit)
  ON CONFLICT (dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('first_visit_date', c.car_proposed_first_visit, 'conversion_date', c.car_proposed_conversion, 'reservations', waiting);
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_car_launch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_car_launch() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_car_threshold(_n integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _n IS NULL OR _n < 1 OR _n > 500 THEN RAISE EXCEPTION 'threshold must be 1–500'; END IF;
  SELECT car_launch_threshold INTO old FROM public.launch_config WHERE scope = 'car';
  UPDATE public.launch_config SET car_launch_threshold = _n, updated_at = now(), updated_by = auth.uid() WHERE scope = 'car';
  INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by) VALUES ('car', 'car_launch_threshold', old::text, _n::text, auth.uid());
  PERFORM public.car_launch_check();
END $$;
REVOKE ALL ON FUNCTION public.admin_set_car_threshold(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_car_threshold(integer) TO authenticated;
REVOKE ALL ON FUNCTION public.car_launch_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.car_launch_status() TO authenticated, service_role;

-- Waitlist founding hold counts 30 days from the service's conversion date.
CREATE OR REPLACE FUNCTION public.sched_waitlist_hold_from_conversion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conv date;
BEGIN
  SELECT conversion_date INTO conv FROM public.launch_config
   WHERE scope = CASE NEW.service::text WHEN 'detailing' THEN 'car' WHEN 'lawn' THEN 'lawn' ELSE 'cleaning' END;
  NEW.founding_hold_until := greatest(now(), coalesce(conv::timestamptz, now())) + interval '30 days';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_waitlist_hold_from_conversion ON public.sched_waitlist;
CREATE TRIGGER trg_waitlist_hold_from_conversion BEFORE INSERT ON public.sched_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.sched_waitlist_hold_from_conversion();