-- lovable-cron-fallback-reviewed: daily job re-registered with a working auth header; no new frequency
-- Phase 3 — make the pay correct.
-- 1. One pay function: drop the retired, frequency-keyed pro_visit_pay_cents.
-- 2. Tier 2 = +10% on the Tier 1 DOLLAR figure, rounded to the dollar (also fixes cent-rounding in contractor_visit_pay_cents).
-- 3. Base pay stays frozen on visits.contractor_pay_cents; the tier uplift is resolved into
--    visits.visit_pay_cents from the ASSIGNED pro (at assignment, at tier change, confirmed at completion).
-- 4. visit_kind is written on every visit; Shine gets 3 washes a month + a full detail every 6th month;
--    weekly cleaning gets a quarterly deep clean paid at that size's monthly rate.
-- 5. Paid-in-full-when-blocked: status 'blocked' REQUIRES paid_in_full_reason; RPC credits the payout week.
-- 6. Referral bonus: status 'paid' REQUIRES a Stripe transfer id; blocked bonuses/referrals recover
--    automatically when Connect onboarding completes; cron re-registered with real auth.

-- 1 ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pro_visit_pay_cents(text, text, text);

-- 2 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contractor_visit_pay_cents(_service text, _size smallint, _cadence text, _tier text DEFAULT NULL::text, _surcharge boolean DEFAULT false, _visit_kind text DEFAULT NULL::text)
 RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
DECLARE
  base integer;
  cad text := COALESCE(_cadence, 'monthly');
BEGIN
  IF _service = 'detailing' THEN
    base := CASE _size
      WHEN 1 THEN CASE WHEN _visit_kind = 'full_detail' THEN 5100 ELSE 1700 END
      WHEN 2 THEN CASE WHEN _visit_kind = 'full_detail' THEN 6100 ELSE 2000 END
      WHEN 3 THEN CASE WHEN _visit_kind = 'full_detail' THEN 8200 ELSE 2700 END
    END;
  ELSE
    IF _service = 'cleaning' AND _visit_kind = 'quarterly_deep_clean' THEN cad := 'monthly'; END IF;
    IF _service = 'cleaning' THEN
      base := CASE _size
        WHEN 1 THEN CASE cad WHEN 'monthly' THEN 5600 WHEN 'biweekly' THEN 5100 ELSE 4600 END
        WHEN 2 THEN CASE cad WHEN 'monthly' THEN 7600 WHEN 'biweekly' THEN 7000 ELSE 6200 END
        WHEN 3 THEN CASE cad WHEN 'monthly' THEN 11200 WHEN 'biweekly' THEN 10300 ELSE 9200 END
      END;
      IF _surcharge THEN base := base + 2400; END IF;
    ELSIF _service = 'lawn' THEN
      base := CASE _size
        WHEN 1 THEN CASE cad WHEN 'monthly' THEN 1800 WHEN 'biweekly' THEN 1600 ELSE 1500 END
        WHEN 2 THEN CASE cad WHEN 'monthly' THEN 2600 WHEN 'biweekly' THEN 2400 ELSE 2100 END
        WHEN 3 THEN CASE cad WHEN 'monthly' THEN 4000 WHEN 'biweekly' THEN 3600 ELSE 3200 END
      END;
      IF _surcharge THEN base := base + 1200; END IF;
    END IF;
  END IF;
  IF base IS NULL THEN RETURN NULL; END IF;
  -- Tier 2: +10% on the DOLLAR figure, rounded to the dollar.
  IF _tier = 'tier_2_pro_partner' THEN base := (round((base / 100.0) * 1.1) * 100)::int; END IF;
  RETURN base;
END;
$function$;

-- 3 ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pro_tier_uplift_cents(_base_cents integer, _pro_uid uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN _base_cents IS NULL THEN NULL
    WHEN _pro_uid IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.applicants a WHERE a.contractor_id = _pro_uid AND a.tier = 'tier_2_pro_partner')
      THEN (round((_base_cents / 100.0) * 1.1) * 100)::int
    ELSE _base_cents
  END;
$$;
REVOKE ALL ON FUNCTION public.pro_tier_uplift_cents(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_tier_uplift_cents(integer, uuid) TO service_role;

-- Fires LAST among BEFORE triggers (alphabetical), i.e. after visits_inherit_assigned_pro.
CREATE OR REPLACE FUNCTION public.visits_resolve_pay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.completed_at IS NOT NULL THEN
    -- Completed work is never repriced.
    NEW.visit_pay_cents := OLD.visit_pay_cents;
    NEW.contractor_pay_cents := OLD.contractor_pay_cents;
    RETURN NEW;
  END IF;
  IF NEW.contractor_pay_cents IS NOT NULL THEN
    NEW.visit_pay_cents := public.pro_tier_uplift_cents(NEW.contractor_pay_cents, NEW.assigned_pro_id);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS zz_visits_resolve_pay ON public.visits;
CREATE TRIGGER zz_visits_resolve_pay
BEFORE INSERT OR UPDATE OF assigned_pro_id, contractor_pay_cents ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.visits_resolve_pay();

-- A promotion (or return to Tier 1) re-resolves every unfinished visit the pro holds.
CREATE OR REPLACE FUNCTION public.applicants_tier_reprice_visits()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.contractor_id IS NOT NULL THEN
    UPDATE public.visits v
       SET visit_pay_cents = public.pro_tier_uplift_cents(v.contractor_pay_cents, NEW.contractor_id)
     WHERE v.assigned_pro_id = NEW.contractor_id
       AND v.completed_at IS NULL
       AND v.contractor_pay_cents IS NOT NULL
       AND v.status IN ('scheduled','on_the_way','in_progress');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_applicants_tier_reprice_visits ON public.applicants;
CREATE TRIGGER trg_applicants_tier_reprice_visits
AFTER UPDATE OF tier ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.applicants_tier_reprice_visits();

-- 4 ---------------------------------------------------------------------------
-- Regular visits carry the plan line's frozen contractor_pay_cents (Tier 1 base).
-- Shine: washes on days 0/10/20 of each billing month (kind maintenance_wash); a full
-- detail on day 24 of billing months 0, 6, 12 ... (kind full_detail, full-detail rate).
-- Weekly cleaning: deep clean on day 24 of billing months 0, 3, 6 ... (kind
-- quarterly_deep_clean, that size's MONTHLY rate, surcharge share included).
-- Day 24 can never collide with the next month's day 0 (earliest 25).
DROP FUNCTION IF EXISTS public.generate_recurring_visits(uuid, integer);
CREATE FUNCTION public.generate_recurring_visits(_subscription_id uuid DEFAULT NULL, _horizon_days integer DEFAULT 45)
RETURNS TABLE(out_subscription_id uuid, out_service text, out_created integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  s record; l record; prof record;
  v_anchor date; v_month_start date; v_limit date; v_stop date;
  v_offsets int[]; v_off int; v_date date; v_k int; v_shift int;
  v_window text; v_created int; v_kind text; v_extra_kind text; v_extra_pay int;
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
      IF l.service = 'detailing' THEN
        v_offsets := ARRAY[0,10,20];
        v_kind := 'maintenance_wash';
        v_extra_kind := 'full_detail';
        v_extra_pay := public.contractor_visit_pay_cents('detailing', l.size_tier, 'monthly', NULL, false, 'full_detail');
      ELSE
        v_offsets := CASE l.cadence WHEN 'weekly' THEN ARRAY[0,7,14,21]
                                    WHEN 'biweekly' THEN ARRAY[0,14]
                                    ELSE ARRAY[0] END;
        v_kind := 'standard';
        IF l.service = 'cleaning' AND l.cadence = 'weekly' THEN
          v_extra_kind := 'quarterly_deep_clean';
          v_extra_pay := public.contractor_visit_pay_cents('cleaning', l.size_tier, 'monthly', NULL, l.surcharge_applied, 'quarterly_deep_clean');
        ELSE
          v_extra_kind := NULL; v_extra_pay := NULL;
        END IF;
      END IF;

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
             size_tier, cadence, surcharge_applied, contractor_pay_cents, visit_kind)
          VALUES
            (s.user_id, s.id, l.service::service_type, l.service, v_date, v_window, 'scheduled',
             l.size_tier, l.cadence, l.surcharge_applied, l.contractor_pay_cents, v_kind)
          ON CONFLICT (subscription_id, service_type, visit_date) WHERE subscription_id IS NOT NULL AND visit_date IS NOT NULL
          DO NOTHING;
          IF FOUND THEN v_created := v_created + 1; END IF;
        END LOOP;

        IF v_extra_kind IS NOT NULL
           AND ((v_extra_kind = 'full_detail' AND v_k % 6 = 0) OR (v_extra_kind = 'quarterly_deep_clean' AND v_k % 3 = 0)) THEN
          v_date := v_month_start + 24;
          IF v_date <= v_stop AND v_date >= CURRENT_DATE THEN
            INSERT INTO public.visits
              (user_id, subscription_id, service, service_type, visit_date, time_window, status,
               size_tier, cadence, surcharge_applied, contractor_pay_cents, visit_kind)
            VALUES
              (s.user_id, s.id, l.service::service_type, l.service, v_date, v_window, 'scheduled',
               l.size_tier, l.cadence, l.surcharge_applied, v_extra_pay, v_extra_kind)
            ON CONFLICT (subscription_id, service_type, visit_date) WHERE subscription_id IS NOT NULL AND visit_date IS NOT NULL
            DO NOTHING;
            IF FOUND THEN v_created := v_created + 1; END IF;
          END IF;
        END IF;

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

-- Pros see what kind of visit it is (never the customer's price).
DROP FUNCTION IF EXISTS public.pro_get_visits(date, date);
CREATE FUNCTION public.pro_get_visits(_from date DEFAULT (CURRENT_DATE - 60), _to date DEFAULT (CURRENT_DATE + 60))
 RETURNS TABLE(id uuid, scheduled_start timestamptz, scheduled_end timestamptz, service_type text, street text, zip text, customer_first_name text, access_notes text, gate_code text, pet_notes text, parking_notes text, visit_pay_cents integer, status text, on_my_way_at timestamptz, completed_at timestamptz, is_sample boolean, before_photos integer, after_photos integer, visit_kind text, paid_in_full_reason text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT v.id, v.scheduled_start, v.scheduled_end, v.service_type, v.street, v.zip,
         v.customer_first_name, v.access_notes, v.gate_code, v.pet_notes, v.parking_notes,
         v.visit_pay_cents, v.status::text, v.on_my_way_at, v.completed_at, v.is_sample,
         (SELECT count(*)::int FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind='before'),
         (SELECT count(*)::int FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind='after'),
         v.visit_kind, v.paid_in_full_reason
  FROM public.visits v
  WHERE v.assigned_pro_id = auth.uid()
    AND (v.scheduled_start IS NULL OR v.scheduled_start::date BETWEEN _from AND _to)
  ORDER BY v.scheduled_start NULLS LAST;
$function$;
REVOKE ALL ON FUNCTION public.pro_get_visits(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_get_visits(date, date) TO authenticated, service_role;

-- 5 ---------------------------------------------------------------------------
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_blocked_requires_reason;
ALTER TABLE public.visits ADD CONSTRAINT visits_blocked_requires_reason
  CHECK (status <> 'blocked' OR paid_in_full_reason IS NOT NULL);
ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_paid_in_full_reason_valid;
ALTER TABLE public.visits ADD CONSTRAINT visits_paid_in_full_reason_valid
  CHECK (paid_in_full_reason IS NULL OR paid_in_full_reason IN
    ('customer_no_access','unsafe_conditions','customer_canceled_same_day','customer_free_visit','first_visit_guarantee','company_error'));

-- Payout week ledger credit (Mon–Sun week, paid the following Friday) — shared by completion and paid-in-full.
CREATE OR REPLACE FUNCTION public.credit_payout_week(_pro uuid, _at timestamptz, _cents integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_start date; v_id uuid;
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin')) THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_start := date_trunc('week', COALESCE(_at, now()))::date;
  UPDATE public.payout_weeks SET visit_pay_cents = COALESCE(visit_pay_cents,0) + _cents
   WHERE pro_id = _pro AND week_start = v_start RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.payout_weeks (pro_id, week_start, week_end, payout_date, status, visit_pay_cents)
    VALUES (_pro, v_start, v_start + 6, v_start + 11, 'pending', _cents) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.credit_payout_week(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_payout_week(uuid, timestamptz, integer) TO service_role;

-- Marks a visit blocked / free-to-customer and pays the assigned pro in full, once.
-- Admin (JWT) or service role. The reason is mandatory and constrained; the note is kept for audit.
CREATE OR REPLACE FUNCTION public.mark_visit_paid_in_full(_visit_id uuid, _reason text, _note text DEFAULT NULL, _actor text DEFAULT 'admin')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; v_pay int; v_week uuid;
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _reason IS NULL OR _reason = '' THEN RAISE EXCEPTION 'reason_required'; END IF;

  SELECT * INTO v FROM public.visits WHERE id = _visit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found'; END IF;
  IF v.status NOT IN ('scheduled','on_the_way','in_progress') THEN RAISE EXCEPTION 'visit_not_open: %', v.status; END IF;
  IF v.assigned_pro_id IS NULL THEN RAISE EXCEPTION 'no_pro_assigned'; END IF;

  v_pay := COALESCE(public.pro_tier_uplift_cents(v.contractor_pay_cents, v.assigned_pro_id), v.visit_pay_cents, 0);

  UPDATE public.visits SET
    status = 'blocked',
    paid_in_full_reason = _reason,
    lifecycle_reason = 'paid_in_full',
    visit_pay_cents = v_pay,
    notes = concat_ws(E'\n', notes, format('[paid in full · %s · %s] %s', _actor, _reason, COALESCE(_note,'')))
  WHERE id = _visit_id;

  v_week := public.credit_payout_week(v.assigned_pro_id, COALESCE(v.scheduled_start, now()), v_pay);

  INSERT INTO public.admin_alerts (alert_type, title, body, context)
  VALUES ('visit_paid_in_full', format('Visit paid in full — %s', _reason),
          format('Visit %s paid $%s to the assigned pro. Reported by %s. %s', _visit_id, v_pay / 100.0, _actor, COALESCE(_note,'')),
          jsonb_build_object('visit_id', _visit_id, 'reason', _reason, 'pay_cents', v_pay, 'actor', _actor));

  RETURN jsonb_build_object('ok', true, 'visit_id', _visit_id, 'status', 'blocked', 'paid_in_full_reason', _reason, 'visit_pay_cents', v_pay, 'payout_week_id', v_week);
END;
$$;
REVOKE ALL ON FUNCTION public.mark_visit_paid_in_full(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_visit_paid_in_full(uuid, text, text, text) TO authenticated, service_role;

-- 6 ---------------------------------------------------------------------------
ALTER TABLE public.pro_referrals ADD COLUMN IF NOT EXISTS stripe_transfer_id text;
ALTER TABLE public.pro_referrals ADD COLUMN IF NOT EXISTS blocked_reason text;
CREATE UNIQUE INDEX IF NOT EXISTS pro_referrals_stripe_transfer_id_uniq ON public.pro_referrals (stripe_transfer_id) WHERE stripe_transfer_id IS NOT NULL;
ALTER TABLE public.pro_referrals DROP CONSTRAINT IF EXISTS pro_referrals_paid_requires_transfer;
ALTER TABLE public.pro_referrals ADD CONSTRAINT pro_referrals_paid_requires_transfer
  CHECK (status <> 'paid' OR (stripe_transfer_id IS NOT NULL AND bonus_paid_at IS NOT NULL));

-- 'blocked' is no longer terminal: finishing Connect onboarding releases the rows back to pending.
CREATE OR REPLACE FUNCTION public.applicants_connect_unblock_bonuses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.stripe_connect_complete AND NEW.stripe_account_id IS NOT NULL
     AND (OLD.stripe_connect_complete IS DISTINCT FROM true OR OLD.stripe_account_id IS NULL) THEN
    UPDATE public.pro_bonuses SET status = 'pending', blocked_reason = NULL
     WHERE pro_id = NEW.id AND status = 'blocked';
    IF NEW.contractor_id IS NOT NULL THEN
      UPDATE public.pro_referrals SET status = 'pending', blocked_reason = NULL
       WHERE referrer_contractor_id = NEW.contractor_id AND status = 'blocked';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_applicants_connect_unblock_bonuses ON public.applicants;
CREATE TRIGGER trg_applicants_connect_unblock_bonuses
AFTER UPDATE OF stripe_connect_complete, stripe_account_id ON public.applicants
FOR EACH ROW EXECUTE FUNCTION public.applicants_connect_unblock_bonuses();

-- The referral cron now needs real auth (x-cron-key), like every other job.
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'referral-bonus-check-daily';
  PERFORM cron.schedule('referral-bonus-check-daily', '0 9 * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/referral-bonus-check',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', public.admin_get_service_role_key()),
      body := jsonb_build_object('at', now())
    );
  $cmd$);
END $$;