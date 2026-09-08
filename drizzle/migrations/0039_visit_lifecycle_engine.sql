-- lovable-cron-fallback-reviewed: 1440 runs/day; re-registers the pre-existing every-minute expire-addon-requests job (15-minute walkaway deadline) with a working auth header, no new load
-- Phase 2 — make the service actually happen.
-- 1. Recurring visit generation (monthly 1 / biweekly 2 / weekly 4 per billing month), idempotent, scheduled here.
-- 2. Seeded visits get scheduled_start/end and pick up a pro assigned later.
-- 3. Address / access fields copied from the profile onto every visit (no price column exists on visits).
-- 4. Cancel / pause / resume flips future visits.
-- 5. subscriptions.stripe_status records the real Stripe state.
-- 6. cron expire-addon-requests re-created with a header the function accepts.

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS stripe_status text;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS lifecycle_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS visits_sub_service_date_uniq
  ON public.visits (subscription_id, service_type, visit_date)
  WHERE subscription_id IS NOT NULL AND visit_date IS NOT NULL;

-- 2 + 3 -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.visits_fill_schedule_and_address()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  p record;
  v_start_hour int := 9;
  v_end_hour   int := 13;
BEGIN
  IF NEW.service_type IS NULL AND NEW.service IS NOT NULL THEN NEW.service_type := NEW.service::text; END IF;
  IF NEW.service IS NULL AND NEW.service_type IN ('cleaning','lawn','detailing') THEN NEW.service := NEW.service_type::service_type; END IF;

  IF NEW.visit_date IS NULL AND NEW.scheduled_start IS NOT NULL THEN
    NEW.visit_date := (NEW.scheduled_start AT TIME ZONE 'America/New_York')::date;
  END IF;
  IF NEW.scheduled_start IS NULL AND NEW.visit_date IS NOT NULL THEN
    IF NEW.time_window LIKE '8:00 AM%'  THEN v_start_hour := 8;  v_end_hour := 12;
    ELSIF NEW.time_window LIKE '12:00 PM%' THEN v_start_hour := 12; v_end_hour := 17;
    END IF;
    NEW.scheduled_start := (NEW.visit_date::timestamp + make_interval(hours => v_start_hour)) AT TIME ZONE 'America/New_York';
    NEW.scheduled_end   := (NEW.visit_date::timestamp + make_interval(hours => v_end_hour))   AT TIME ZONE 'America/New_York';
  END IF;

  IF NEW.user_id IS NOT NULL AND (NEW.street IS NULL OR NEW.zip IS NULL OR NEW.customer_first_name IS NULL) THEN
    SELECT first_name, address_line1, address_line2, zip, gate_code, parking_notes, pets, special_instructions
      INTO p FROM public.profiles WHERE user_id = NEW.user_id;
    IF FOUND THEN
      NEW.customer_first_name := COALESCE(NEW.customer_first_name, p.first_name);
      NEW.street := COALESCE(NEW.street, NULLIF(concat_ws(', ', NULLIF(p.address_line1,''), NULLIF(p.address_line2,'')), ''));
      NEW.zip := COALESCE(NEW.zip, p.zip);
      NEW.gate_code := COALESCE(NEW.gate_code, NULLIF(p.gate_code,''));
      NEW.parking_notes := COALESCE(NEW.parking_notes, NULLIF(p.parking_notes,''));
      NEW.pet_notes := COALESCE(NEW.pet_notes, NULLIF(p.pets,''));
      NEW.access_notes := COALESCE(NEW.access_notes, NULLIF(p.special_instructions,''));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_fill_schedule_and_address ON public.visits;
CREATE TRIGGER trg_visits_fill_schedule_and_address
BEFORE INSERT ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.visits_fill_schedule_and_address();

CREATE OR REPLACE FUNCTION public.profiles_sync_future_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.visits v SET
    customer_first_name = NEW.first_name,
    street = NULLIF(concat_ws(', ', NULLIF(NEW.address_line1,''), NULLIF(NEW.address_line2,'')), ''),
    zip = NEW.zip,
    gate_code = NULLIF(NEW.gate_code,''),
    parking_notes = NULLIF(NEW.parking_notes,''),
    pet_notes = NULLIF(NEW.pets,''),
    access_notes = NULLIF(NEW.special_instructions,'')
  WHERE v.user_id = NEW.user_id
    AND v.completed_at IS NULL
    AND v.status IN ('scheduled','on_the_way')
    AND COALESCE(v.visit_date, CURRENT_DATE) >= CURRENT_DATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_future_visits ON public.profiles;
CREATE TRIGGER trg_profiles_sync_future_visits
AFTER UPDATE OF first_name, address_line1, address_line2, zip, gate_code, parking_notes, pets, special_instructions
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_future_visits();

-- 2 -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscriptions_propagate_pro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_applicant uuid; v_uid uuid; v_old_uid uuid;
BEGIN
  IF NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id
     AND NEW.preferred_pro_id IS NOT DISTINCT FROM OLD.preferred_pro_id THEN
    RETURN NEW;
  END IF;
  v_applicant := COALESCE(NEW.assigned_pro_id, NEW.preferred_pro_id);
  IF v_applicant IS NOT NULL THEN
    SELECT a.contractor_id INTO v_uid FROM public.applicants a WHERE a.id = v_applicant;
  END IF;
  SELECT a.contractor_id INTO v_old_uid FROM public.applicants a
   WHERE a.id = COALESCE(OLD.assigned_pro_id, OLD.preferred_pro_id);

  UPDATE public.visits v SET assigned_pro_id = v_uid
   WHERE v.subscription_id = NEW.id
     AND v.completed_at IS NULL
     AND v.status IN ('scheduled','on_the_way')
     AND (v.scheduled_start IS NULL OR v.scheduled_start >= now())
     AND (v.assigned_pro_id IS NULL OR v.assigned_pro_id = v_old_uid);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_propagate_pro ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_propagate_pro
AFTER UPDATE OF assigned_pro_id, preferred_pro_id ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_propagate_pro();

-- 4 -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscriptions_lifecycle_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_resume_from date;
BEGIN
  IF NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled' THEN
    UPDATE public.visits v
       SET status = 'canceled', lifecycle_reason = 'subscription_canceled'
     WHERE v.subscription_id = NEW.id
       AND v.completed_at IS NULL
       AND v.status IN ('scheduled','on_the_way','skipped')
       AND COALESCE(v.visit_date, CURRENT_DATE) >= CURRENT_DATE;

  ELSIF NEW.status = 'paused' AND OLD.status IS DISTINCT FROM 'paused' THEN
    UPDATE public.visits v
       SET status = 'skipped', lifecycle_reason = 'subscription_paused'
     WHERE v.subscription_id = NEW.id
       AND v.completed_at IS NULL
       AND v.status IN ('scheduled','on_the_way')
       AND COALESCE(v.visit_date, CURRENT_DATE) >= CURRENT_DATE;

  ELSIF NEW.status = 'active' AND OLD.status = 'paused' THEN
    v_resume_from := GREATEST(CURRENT_DATE, COALESCE((OLD.paused_until AT TIME ZONE 'America/New_York')::date, CURRENT_DATE));
    UPDATE public.visits v
       SET status = 'scheduled', lifecycle_reason = NULL
     WHERE v.subscription_id = NEW.id
       AND v.status = 'skipped'
       AND v.lifecycle_reason = 'subscription_paused'
       AND v.visit_date >= v_resume_from;
  END IF;

  IF NEW.cancel_at_period_end AND NEW.next_billing_date IS NOT NULL THEN
    UPDATE public.visits v
       SET status = 'canceled', lifecycle_reason = 'cancel_at_period_end'
     WHERE v.subscription_id = NEW.id
       AND v.completed_at IS NULL
       AND v.status IN ('scheduled','skipped')
       AND v.visit_date >= NEW.next_billing_date;
  ELSIF NOT NEW.cancel_at_period_end AND OLD.cancel_at_period_end AND NEW.status = 'active' THEN
    UPDATE public.visits v
       SET status = 'scheduled', lifecycle_reason = NULL
     WHERE v.subscription_id = NEW.id
       AND v.status = 'canceled'
       AND v.lifecycle_reason = 'cancel_at_period_end'
       AND v.visit_date >= CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscriptions_lifecycle_visits ON public.subscriptions;
CREATE TRIGGER trg_subscriptions_lifecycle_visits
AFTER UPDATE OF status, cancel_at_period_end, next_billing_date ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_lifecycle_visits();

-- 1 -----------------------------------------------------------------------------
-- Billing month k for a plan line starts at anchor + k months, snapped to the anchor weekday.
-- monthly: day 0; biweekly: days 0,14; weekly: days 0,7,14,21. Unique index makes re-runs no-ops.
CREATE OR REPLACE FUNCTION public.generate_recurring_visits(_subscription_id uuid DEFAULT NULL, _horizon_days integer DEFAULT 45)
RETURNS TABLE(subscription_id uuid, service text, created integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s record; l record; prof record;
  v_anchor date; v_month_start date; v_limit date; v_stop date;
  v_offsets int[]; v_off int; v_date date; v_k int; v_shift int;
  v_window text; v_created int;
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_limit := CURRENT_DATE + GREATEST(_horizon_days, 1);

  FOR s IN
    SELECT sub.* FROM public.subscriptions sub
    WHERE sub.status = 'active'
      AND (_subscription_id IS NULL OR sub.id = _subscription_id)
      AND jsonb_typeof(sub.plan_lines) = 'array' AND jsonb_array_length(sub.plan_lines) > 0
  LOOP
    SELECT preferred_day, preferred_time INTO prof FROM public.profiles WHERE user_id = s.user_id;
    v_window := CASE prof.preferred_time WHEN 'morning' THEN '8:00 AM – 12:00 PM'
                                         WHEN 'afternoon' THEN '12:00 PM – 5:00 PM'
                                         ELSE '9:00 AM – 1:00 PM' END;
    v_stop := CASE WHEN s.cancel_at_period_end AND s.next_billing_date IS NOT NULL
                   THEN LEAST(v_limit, s.next_billing_date - 1) ELSE v_limit END;

    FOR l IN
      SELECT x->>'service' AS service,
             COALESCE(x->>'cadence','monthly') AS cadence,
             NULLIF(x->>'size_tier','')::smallint AS size_tier,
             COALESCE((x->>'surcharge_applied')::boolean, false) AS surcharge_applied,
             NULLIF(x->>'contractor_pay_cents','')::int AS contractor_pay_cents
      FROM jsonb_array_elements(s.plan_lines) x
    LOOP
      v_created := 0;
      v_offsets := CASE l.cadence WHEN 'weekly' THEN ARRAY[0,7,14,21]
                                  WHEN 'biweekly' THEN ARRAY[0,14]
                                  ELSE ARRAY[0] END;

      SELECT min(v.visit_date) INTO v_anchor
        FROM public.visits v WHERE v.subscription_id = s.id AND v.service_type = l.service;
      IF v_anchor IS NULL THEN
        v_anchor := CURRENT_DATE + 5;
        IF prof.preferred_day IS NOT NULL THEN
          v_shift := array_position(ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], prof.preferred_day);
          IF v_shift IS NOT NULL THEN
            v_shift := ((v_shift - 1) - extract(dow from CURRENT_DATE)::int + 7) % 7;
            IF v_shift < 2 THEN v_shift := v_shift + 7; END IF;
            v_anchor := CURRENT_DATE + v_shift;
          END IF;
        END IF;
      END IF;

      v_k := 0;
      LOOP
        v_month_start := (v_anchor + make_interval(months => v_k))::date;
        v_shift := (extract(dow from v_anchor)::int - extract(dow from v_month_start)::int + 7) % 7;
        IF v_shift > 3 THEN v_shift := v_shift - 7; END IF;
        v_month_start := v_month_start + v_shift;
        EXIT WHEN v_month_start > v_stop;

        FOREACH v_off IN ARRAY v_offsets LOOP
          v_date := v_month_start + v_off;
          CONTINUE WHEN v_date > v_stop OR v_date < CURRENT_DATE;
          INSERT INTO public.visits
            (user_id, subscription_id, service, service_type, visit_date, time_window, status,
             size_tier, cadence, surcharge_applied, contractor_pay_cents, visit_pay_cents)
          VALUES
            (s.user_id, s.id, l.service::service_type, l.service, v_date, v_window, 'scheduled',
             l.size_tier, l.cadence, l.surcharge_applied, l.contractor_pay_cents, l.contractor_pay_cents)
          ON CONFLICT (subscription_id, service_type, visit_date) WHERE subscription_id IS NOT NULL AND visit_date IS NOT NULL
          DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END LOOP;
        v_k := v_k + 1;
        EXIT WHEN v_k > 24;
      END LOOP;

      subscription_id := s.id; service := l.service; created := v_created;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_recurring_visits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_visits(uuid, integer) TO authenticated, service_role;

-- Schedules, committed in the repo --------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'generate-recurring-visits-daily';
  PERFORM cron.schedule('generate-recurring-visits-daily', '30 9 * * *',
    $cmd$ SELECT public.generate_recurring_visits(NULL, 45); $cmd$);
END $$;

-- 6: x-cron-key pattern (same as the KPI jobs). The function's shared cron auth
-- accepts the env key OR the stored service key, so this stops returning 401.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'expire-addon-requests';
  PERFORM cron.schedule('expire-addon-requests', '* * * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/expire-addon-requests',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key', public.admin_get_service_role_key()
      ),
      body := jsonb_build_object('at', now())
    );
  $cmd$);
END $$;