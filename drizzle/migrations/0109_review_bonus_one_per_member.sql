ALTER TABLE public.pro_bonuses ADD COLUMN IF NOT EXISTS member_user_id uuid;
ALTER TABLE public.pro_bonuses ADD COLUMN IF NOT EXISTS member_display text;
ALTER TABLE public.pro_bonuses ADD COLUMN IF NOT EXISTS payout_week_id uuid REFERENCES public.payout_weeks(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pro_bonuses_one_review_bonus_per_member
  ON public.pro_bonuses(member_user_id)
  WHERE bonus_type = 'review_bonus' AND member_user_id IS NOT NULL AND status <> 'blocked';

CREATE OR REPLACE FUNCTION public.review_bonus_next_friday()
RETURNS date LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN d = (now() AT TIME ZONE 'America/New_York')::date THEN d + 7 ELSE d END
  FROM (SELECT (now() AT TIME ZONE 'America/New_York')::date
     + ((5 - extract(isodow FROM (now() AT TIME ZONE 'America/New_York'))::int + 7) % 7) AS d) x
$$;

CREATE OR REPLACE FUNCTION public.review_bonus_precheck(_member uuid, _pro uuid, _stars integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_completed boolean; v_served boolean; v_used boolean;
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT EXISTS (SELECT 1 FROM visits WHERE user_id = _member AND status = 'complete') INTO v_completed;
  SELECT EXISTS (SELECT 1 FROM visits WHERE user_id = _member AND status = 'complete' AND assigned_pro_id = _pro) INTO v_served;
  SELECT EXISTS (SELECT 1 FROM pro_bonuses WHERE member_user_id = _member AND bonus_type = 'review_bonus' AND status <> 'blocked') INTO v_used;
  RETURN jsonb_build_object(
    'member_has_completed_visit', v_completed,
    'pro_served_member', v_served,
    'rating_is_five', COALESCE(_stars, 0) = 5,
    'member_not_used', NOT v_used,
    'ok', v_completed AND v_served AND COALESCE(_stars,0) = 5 AND NOT v_used,
    'payout_date', public.review_bonus_next_friday());
END $$;
REVOKE ALL ON FUNCTION public.review_bonus_precheck(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_bonus_precheck(uuid, uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_review_bonus(_member uuid, _pro uuid, _review_date date, _stars integer, _review_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE chk jsonb; v_friday date; v_start date; v_week uuid; v_review uuid; v_bonus uuid;
  v_first text; v_last text; v_display text; v_contractor uuid; v_actor uuid := auth.uid();
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('review_bonus:' || _member::text));
  chk := public.review_bonus_precheck(_member, _pro, _stars);
  IF NOT (chk->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'checks', chk);
  END IF;

  SELECT first_name, last_name INTO v_first, v_last FROM profiles WHERE user_id = _member;
  v_display := trim(COALESCE(v_first, 'A member') || CASE WHEN COALESCE(v_last,'') <> '' THEN ' ' || left(v_last,1) || '.' ELSE '' END);

  v_friday := public.review_bonus_next_friday();
  v_start := v_friday - 11;
  INSERT INTO payout_weeks (pro_id, week_start, week_end, payout_date, status, visit_pay_cents, bonus_cents)
  VALUES (_pro, v_start, v_start + 6, v_friday, 'pending', 0, 2500)
  ON CONFLICT (pro_id, week_start) DO UPDATE SET bonus_cents = COALESCE(payout_weeks.bonus_cents,0) + 2500
  RETURNING id INTO v_week;

  INSERT INTO reviews (source, external_review_id, reviewer_name, stars, comment, posted_at, matched_pro_id,
    match_confidence, status, approved_by, approved_at, notes)
  VALUES ('google_admin_entry', 'admin_' || gen_random_uuid()::text, v_display, _stars, _review_text,
    COALESCE(_review_date, current_date)::timestamptz, _pro, 'high', 'approved', v_actor, now(), 'member:' || _member::text)
  RETURNING id INTO v_review;

  INSERT INTO pro_bonuses (pro_id, amount_cents, currency, reason, review_id, period, status, created_by,
    bonus_type, earned_at, member_user_id, member_display, payout_week_id)
  VALUES (_pro, 2500, 'usd', 'Review bonus', v_review, to_char(v_friday, 'YYYY-MM'), 'pending', v_actor,
    'review_bonus', (v_start::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York', _member, v_display, v_week)
  RETURNING id INTO v_bonus;

  SELECT contractor_id INTO v_contractor FROM applicants WHERE id = _pro;
  IF v_contractor IS NOT NULL THEN
    INSERT INTO pro_notifications (contractor_id, kind, title, body, url, context)
    VALUES (v_contractor, 'review_bonus',
      v_display || ' left a five-star review naming you — $25 on Friday.',
      'Review bonus — $25, paid ' || to_char(v_friday, 'Mon DD') || '.', '/pro/earnings',
      jsonb_build_object('bonus_id', v_bonus, 'payout_date', v_friday));
  END IF;

  RETURN jsonb_build_object('ok', true, 'checks', chk, 'bonus_id', v_bonus, 'review_id', v_review,
    'payout_week_id', v_week, 'payout_date', v_friday, 'member_display', v_display);
END $$;
REVOKE ALL ON FUNCTION public.approve_review_bonus(uuid, uuid, date, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_review_bonus(uuid, uuid, date, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pro_review_bonus_total(_pro uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pro uuid := _pro;
BEGIN
  IF v_pro IS NULL THEN SELECT id INTO v_pro FROM applicants WHERE contractor_id = auth.uid(); END IF;
  IF v_pro IS NULL THEN RETURN 0; END IF;
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM applicants WHERE id = v_pro AND contractor_id = auth.uid())) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN COALESCE((SELECT sum(amount_cents) FROM pro_bonuses WHERE pro_id = v_pro AND bonus_type = 'review_bonus' AND status IN ('pending','paid')), 0)::int;
END $$;
REVOKE ALL ON FUNCTION public.pro_review_bonus_total(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_review_bonus_total(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.review_kpis()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_reviews int; v_members int; v_paid int;
BEGIN
  IF NOT (current_user IN ('postgres','service_role','supabase_admin') OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT count(*) INTO v_reviews FROM reviews;
  SELECT count(DISTINCT user_id) INTO v_members FROM subscriptions WHERE status = 'active';
  SELECT COALESCE(sum(amount_cents),0) INTO v_paid FROM pro_bonuses WHERE bonus_type = 'review_bonus' AND status IN ('pending','paid');
  RETURN jsonb_build_object('total_reviews', v_reviews, 'active_members', v_members,
    'reviews_per_100', CASE WHEN v_members > 0 THEN round(v_reviews * 100.0 / v_members, 1) ELSE NULL END,
    'review_bonus_cents', v_paid);
END $$;
REVOKE ALL ON FUNCTION public.review_kpis() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_kpis() TO authenticated, service_role;