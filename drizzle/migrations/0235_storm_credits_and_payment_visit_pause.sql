-- Member Guide money rules, database-first:
-- 1. Tropical storm / hurricane warning day: every visit in the area is
--    credited (never counts against the member's skip allowance).
-- 2. Failed payment: visits pause after 7 unpaid days (the subscription is
--    untouched), no Pro is ever assigned unpaid work, and a successful
--    payment puts the visits back automatically.

-- 1. Storm day: blackout for all services in the ZIP + credit every visit.
CREATE OR REPLACE FUNCTION public.admin_storm_day(_date date, _zip text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE svc public.service_type; v record; credited int := 0; blk jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOREACH svc IN ARRAY ARRAY['cleaning','lawn','detailing']::public.service_type[] LOOP
    blk := public.admin_add_blackout(_date, format('Storm warning: %s, %s', _zip, public.sched_fmt(_date)), 'weather', svc, _zip);
  END LOOP;
  FOR v IN
    SELECT id, user_id, subscription_id FROM public.visits
    WHERE visit_date = _date AND zip = _zip AND status::text IN ('scheduled','on_the_way')
  LOOP
    IF public.issue_member_credit(v.user_id, v.subscription_id, v.id, 'weather_credit',
         public.visit_customer_price_cents(v.id), 'Storm warning — visit on us') IS NOT NULL THEN
      credited := credited + 1;
      PERFORM public.sched_customer_notice(v.user_id, 'weather_credit', 'Storm day — this one is on us',
        'With the storm warning we have paused your visit and credited it in full — it does not count as one of your skips. We will be in touch with a new day as soon as it is safe.',
        'storm-credit-' || v.id, v.id,
        'Tidy: storm warning — your visit is paused and credited in full (not a skip). We will reach out with a new day as soon as it is safe.',
        now() + interval '3 days');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'visits_credited', credited);
END $$;
REVOKE ALL ON FUNCTION public.admin_storm_day(date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_storm_day(date, text) TO authenticated;

-- 2. Daily payment pause/resume tick (called by member-ops-tick).
CREATE OR REPLACE FUNCTION public.payment_pause_tick() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s record; paused int := 0; resumed int := 0; today date := (now() AT TIME ZONE 'America/New_York')::date;
BEGIN
  -- Pause visits when the latest failed invoice is 7+ days old and unpaid.
  FOR s IN
    SELECT DISTINCT sub.id, sub.user_id, inv.stripe_invoice_id
    FROM public.subscriptions sub
    JOIN public.invoices inv ON inv.subscription_id = sub.id AND inv.status = 'failed'
    WHERE sub.status::text = 'active'
      AND inv.invoice_date <= today - 7
      AND NOT EXISTS (SELECT 1 FROM public.invoices p WHERE p.subscription_id = sub.id AND p.status = 'paid' AND p.invoice_date >= inv.invoice_date)
      AND EXISTS (SELECT 1 FROM public.visits v WHERE v.subscription_id = sub.id AND v.status::text = 'scheduled' AND v.visit_date >= today)
  LOOP
    UPDATE public.visits SET status = 'blocked', lifecycle_reason = 'payment_failed'
    WHERE subscription_id = s.id AND status::text = 'scheduled' AND visit_date >= today;
    PERFORM public.sched_customer_notice(s.user_id, 'payment_paused', 'Visits paused — payment issue',
      'We could not collect your last payment, so your upcoming visits are on hold. Update your card in your Tidy account and everything resumes automatically — your plan and price stay exactly the same.',
      'payment-paused-' || s.stripe_invoice_id, NULL,
      'Tidy: we could not collect your last payment, so your visits are on hold. Update your card in your account and everything resumes automatically — same plan, same price.',
      now() + interval '7 days');
    paused := paused + 1;
  END LOOP;

  -- Resume visits once payment succeeds again.
  FOR s IN
    SELECT DISTINCT sub.id, sub.user_id
    FROM public.subscriptions sub
    WHERE sub.status::text = 'active'
      AND EXISTS (SELECT 1 FROM public.visits v WHERE v.subscription_id = sub.id AND v.status::text = 'blocked' AND v.lifecycle_reason = 'payment_failed')
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.subscription_id = sub.id AND inv.status = 'failed'
          AND NOT EXISTS (SELECT 1 FROM public.invoices p WHERE p.subscription_id = sub.id AND p.status = 'paid' AND p.invoice_date >= inv.invoice_date))
  LOOP
    UPDATE public.visits SET status = 'scheduled', lifecycle_reason = NULL
    WHERE subscription_id = s.id AND status::text = 'blocked' AND lifecycle_reason = 'payment_failed' AND visit_date >= today;
    PERFORM public.sched_customer_notice(s.user_id, 'payment_resumed', 'You are back on the schedule',
      'Your payment went through — your visits are back on the schedule, same days, same Pro.',
      'payment-resumed-' || s.id || '-' || today, NULL,
      'Tidy: your payment went through — your visits are back on, same days, same Pro.',
      now() + interval '2 days');
    resumed := resumed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'subs_paused', paused, 'subs_resumed', resumed);
END $$;
REVOKE ALL ON FUNCTION public.payment_pause_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payment_pause_tick() TO service_role;