-- The RETURNS TABLE output column `subscription_id` shadowed the visits column
-- inside ON CONFLICT (subscription_id, ...), making the reference ambiguous and
-- aborting every generation run. Output columns are renamed; body unchanged.
DROP FUNCTION IF EXISTS public.generate_recurring_visits(uuid, integer);

CREATE FUNCTION public.generate_recurring_visits(_subscription_id uuid DEFAULT NULL, _horizon_days integer DEFAULT 45)
RETURNS TABLE(out_subscription_id uuid, out_service text, out_created integer)
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

      out_subscription_id := s.id; out_service := l.service; out_created := v_created;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_recurring_visits(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_recurring_visits(uuid, integer) TO authenticated, service_role;