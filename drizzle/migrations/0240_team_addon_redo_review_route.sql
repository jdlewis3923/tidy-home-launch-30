-- Team add-on completion: who did each add-on, or done together (split pay).
ALTER TABLE public.addon_attaches
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS split_pay boolean NOT NULL DEFAULT false;

-- A Pro on the visit marks an add-on done: 'self' (they did it, they are paid)
-- or 'together' (both team Pros did it, pay splits). Solo visits ignore mode.
CREATE OR REPLACE FUNCTION public.pro_complete_addon(_attach uuid, _mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.addon_attaches; v public.visits; t public.cleaning_teams; me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO a FROM public.addon_attaches WHERE id = _attach;
  IF NOT FOUND OR a.visit_id IS NULL THEN RAISE EXCEPTION 'attach_not_found'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = a.visit_id;
  IF v.status::text IN ('complete','blocked','canceled','skipped') THEN RAISE EXCEPTION 'visit_closed'; END IF;
  IF v.service::text = 'cleaning' THEN
    IF NOT public.pro_on_cleaning_team_visit(v.id, me) THEN RAISE EXCEPTION 'not_on_visit'; END IF;
  ELSIF v.assigned_pro_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'not_on_visit';
  END IF;
  IF a.status = 'completed' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF _mode NOT IN ('self','together') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;
  UPDATE public.addon_attaches SET
    status = 'completed',
    completed_at = now(),
    completed_by = me,
    split_pay = (_mode = 'together' AND v.service::text = 'cleaning' AND v.size_tier = 5 AND t.kind = 'paired_pros')
  WHERE id = a.id;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.pro_complete_addon(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_complete_addon(uuid,text) TO authenticated;

-- Pay recording: distribute each completed add-on to the Pro who did it,
-- split when done together on a paired visit, default to the Lead. Pending
-- add-ons auto-complete to the Lead at visit close so none are ever unpaid.
CREATE OR REPLACE FUNCTION public.cleaning_record_pay(_visit uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; p uuid; second uuid; share integer; total integer := 0; amount integer; inserted uuid; base integer; premium integer; partial integer; paid integer; att record; att_pay integer;
BEGIN
  IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = _visit FOR UPDATE;
  IF NOT FOUND OR v.service::text IS DISTINCT FROM 'cleaning' OR v.status::text NOT IN ('complete','blocked') OR v.assigned_pro_id IS NULL THEN RAISE EXCEPTION 'cleaning_visit_not_finished'; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;
  share := CASE WHEN v.size_tier = 5 AND t.kind = 'paired_pros' THEN 2 ELSE 1 END;
  second := CASE WHEN share = 2 THEN coalesce(v.backup_pro_id, t.partner_pro_id) ELSE NULL END;
  base := coalesce(v.cleaning_base_pay_cents, public.contractor_visit_pay_cents('cleaning', v.size_tier, 'monthly', NULL, false, NULL));
  premium := CASE WHEN v.cleaning_first_visit AND v.status::text = 'complete' AND NOT coalesce(v.is_redo, false) THEN base/2 ELSE 0 END;
  partial := CASE WHEN coalesce(v.is_redo, false) OR v.status::text = 'blocked' THEN -base/2 ELSE 0 END;
  IF v.status::text = 'complete' AND NOT coalesce(v.is_redo, false) THEN
    UPDATE public.addon_attaches SET status = 'completed', completed_at = now(), completed_by = coalesce(completed_by, v.assigned_pro_id)
    WHERE visit_id = v.id AND status = 'pending_visit';
  END IF;
  FOR p IN SELECT v.assigned_pro_id UNION SELECT second WHERE second IS NOT NULL LOOP
    inserted := NULL;
    paid := coalesce(public.pro_tier_uplift_cents(base + premium + partial, p), base + premium + partial)/share;
    amount := base/share;
    INSERT INTO public.cleaning_pay_lines(visit_id, pro_id, kind, amount_cents, dedupe_key) VALUES(v.id, p, CASE WHEN v.is_redo THEN 'redo' ELSE 'base' END, amount, 'cleaning_visit:' || v.id || ':' || p) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO inserted;
    IF inserted IS NOT NULL THEN
      IF premium > 0 THEN INSERT INTO public.cleaning_pay_lines(visit_id, pro_id, kind, amount_cents, dedupe_key) VALUES(v.id, p, 'first_visit', premium/share, 'cleaning_first:' || v.id || ':' || p); END IF;
      IF partial < 0 THEN INSERT INTO public.cleaning_pay_lines(visit_id, pro_id, kind, amount_cents, dedupe_key) VALUES(v.id, p, 'partial', partial/share, 'cleaning_partial:' || v.id || ':' || p); END IF;
      IF paid <> (base + premium + partial)/share THEN INSERT INTO public.cleaning_pay_lines(visit_id, pro_id, kind, amount_cents, dedupe_key) VALUES(v.id, p, 'base', paid - (base + premium + partial)/share, 'cleaning_tier:' || v.id || ':' || p); END IF;
      IF v.status::text = 'complete' AND NOT coalesce(v.is_redo, false) THEN
        FOR att IN SELECT * FROM public.addon_attaches WHERE visit_id = v.id AND status = 'completed' LOOP
          att_pay := coalesce(att.contractor_pay_cents, 0);
          IF att_pay <= 0 THEN CONTINUE; END IF;
          IF att.split_pay AND share = 2 THEN
            att_pay := CASE WHEN p = v.assigned_pro_id THEN att_pay - att_pay/2 ELSE att_pay/2 END;
          ELSIF att.completed_by IS NOT NULL AND att.completed_by IS DISTINCT FROM p THEN
            CONTINUE;
          ELSIF att.completed_by IS NULL AND p IS DISTINCT FROM v.assigned_pro_id THEN
            CONTINUE;
          END IF;
          INSERT INTO public.cleaning_pay_lines(visit_id, pro_id, kind, amount_cents, dedupe_key) VALUES(v.id, p, 'addon', att_pay, 'cleaning_addon:' || v.id || ':' || p || ':' || att.id) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO inserted;
          IF inserted IS NOT NULL THEN paid := paid + att_pay; END IF;
        END LOOP;
      END IF;
      PERFORM public.credit_payout_week(p, coalesce(v.scheduled_start, v.completed_at, now()), paid);
      IF NOT coalesce(v.is_redo, false) AND v.status::text = 'complete' THEN UPDATE public.applicants SET completed_visits = coalesce(completed_visits, 0) + 1, last_visit_at = now() WHERE contractor_id = p AND NOT coalesce(is_test_row, false); END IF;
      total := total + paid;
    END IF;
  END LOOP;
  RETURN total;
END $$;

-- Pay estimate mirrors the same add-on rules so the job screen matches payout.
CREATE OR REPLACE FUNCTION public.cleaning_pro_visit_pay(_visit uuid, _pro uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; amount integer; addon integer; share integer; second uuid;
BEGIN
  IF NOT public.is_service_caller() AND auth.uid() IS DISTINCT FROM _pro AND NOT public.current_user_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.pro_on_cleaning_team_visit(_visit, _pro) THEN RAISE EXCEPTION 'visit_not_assigned'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF v.service::text <> 'cleaning' THEN RETURN v.visit_pay_cents; END IF;
  IF EXISTS(SELECT 1 FROM public.cleaning_pay_lines WHERE visit_id = _visit AND pro_id = _pro) THEN SELECT sum(amount_cents)::integer INTO amount FROM public.cleaning_pay_lines WHERE visit_id = _visit AND pro_id = _pro; RETURN amount; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;
  share := CASE WHEN v.size_tier = 5 AND t.kind = 'paired_pros' THEN 2 ELSE 1 END;
  second := CASE WHEN share = 2 THEN coalesce(v.backup_pro_id, t.partner_pro_id) ELSE NULL END;
  amount := coalesce(v.cleaning_base_pay_cents, public.contractor_visit_pay_cents('cleaning', v.size_tier, 'monthly', NULL, false, NULL));
  IF v.cleaning_first_visit THEN amount := amount*3/2; END IF;
  IF coalesce(v.is_redo, false) OR v.status::text = 'blocked' THEN amount := coalesce(v.cleaning_base_pay_cents, public.contractor_visit_pay_cents('cleaning', v.size_tier, 'monthly', NULL, false, NULL))/2; END IF;
  amount := coalesce(public.pro_tier_uplift_cents(amount, _pro), amount)/share;
  IF NOT coalesce(v.is_redo, false) AND v.status::text <> 'blocked' THEN
    SELECT coalesce(sum(CASE
      WHEN a.split_pay AND share = 2 THEN CASE WHEN _pro = v.assigned_pro_id THEN a.contractor_pay_cents - a.contractor_pay_cents/2 ELSE a.contractor_pay_cents/2 END
      WHEN a.completed_by IS NOT NULL AND a.completed_by IS DISTINCT FROM _pro THEN 0
      WHEN a.completed_by IS NULL AND _pro IS DISTINCT FROM v.assigned_pro_id THEN 0
      ELSE a.contractor_pay_cents END), 0)::integer INTO addon
    FROM public.addon_attaches a WHERE a.visit_id = v.id AND a.status IN ('pending_visit','completed');
    amount := amount + addon;
  END IF;
  RETURN amount;
END $$;

-- Backup Pros see the visit in their job list too.
CREATE OR REPLACE FUNCTION public.pro_get_visits(_from date DEFAULT (CURRENT_DATE-60), _to date DEFAULT (CURRENT_DATE+60)) RETURNS TABLE(id uuid, scheduled_start timestamptz, scheduled_end timestamptz, service_type text, street text, zip text, customer_first_name text, access_notes text, gate_code text, pet_notes text, parking_notes text, visit_pay_cents integer, status text, on_my_way_at timestamptz, completed_at timestamptz, is_sample boolean, before_photos integer, after_photos integer, visit_kind text, paid_in_full_reason text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT v.id, v.scheduled_start, v.scheduled_end, v.service_type, v.street, v.zip, v.customer_first_name, CASE WHEN v.visit_date = (now() AT TIME ZONE 'America/New_York')::date THEN public.access_decrypt(v.access_notes_enc) END, CASE WHEN v.visit_date = (now() AT TIME ZONE 'America/New_York')::date THEN public.access_decrypt(v.gate_code_enc) END, v.pet_notes, v.parking_notes, CASE WHEN v.service::text = 'cleaning' THEN public.cleaning_pro_visit_pay(v.id, auth.uid()) ELSE v.visit_pay_cents END, v.status::text, v.on_my_way_at, v.completed_at, v.is_sample, (SELECT count(*)::integer FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind = 'before'), (SELECT count(*)::integer FROM public.visit_photos p WHERE p.visit_id = v.id AND p.kind = 'after'), v.visit_kind, v.paid_in_full_reason FROM public.visits v LEFT JOIN public.cleaning_teams t ON t.id = v.cleaning_team_id WHERE (v.assigned_pro_id = auth.uid() OR t.partner_pro_id = auth.uid() OR v.backup_pro_id = auth.uid()) AND (v.scheduled_start IS NULL OR v.scheduled_start::date BETWEEN _from AND _to) ORDER BY v.scheduled_start NULLS LAST $$;

-- Responsible-Pro redos: the owner records whose zone was missed.
ALTER TABLE public.redo_requests ADD COLUMN IF NOT EXISTS responsible_pro_id uuid;

-- Team review sharing: one rating per visit stays, but the partner/backup Pro
-- is named on the row so averages and tier rules count it for both.
ALTER TABLE public.visit_ratings ADD COLUMN IF NOT EXISTS team_partner_contractor_id uuid;
CREATE OR REPLACE FUNCTION public.visit_rating_team_mirror() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; partner uuid;
BEGIN
  IF NEW.visit_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v FROM public.visits WHERE id = NEW.visit_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;
  partner := coalesce(v.backup_pro_id, t.partner_pro_id);
  IF partner IS NOT NULL AND partner IS DISTINCT FROM NEW.contractor_id THEN
    NEW.team_partner_contractor_id := partner;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS zz_visit_rating_team_mirror ON public.visit_ratings;
CREATE TRIGGER zz_visit_rating_team_mirror BEFORE INSERT ON public.visit_ratings FOR EACH ROW EXECUTE FUNCTION public.visit_rating_team_mirror();

-- Partner status counts ratings where the Pro was either worker on the visit.
CREATE OR REPLACE FUNCTION public.pro_partner_status(_applicant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT id, contractor_id, tier, coalesce(completed_visits,0) AS visits, avg_customer_rating, pro_since
    FROM public.applicants WHERE id = _applicant
  ), vr AS (
    SELECT avg(coalesce(r.stars, r.rating))::numeric AS avg_stars, count(*) AS n
    FROM public.visit_ratings r, a
    WHERE (r.contractor_id = a.contractor_id OR r.team_partner_contractor_id = a.contractor_id) AND r.verified AND NOT r.excluded_from_average
  ), first_visit AS (
    SELECT min(v.completed_at) AS at FROM public.visits v, a
    WHERE v.assigned_pro_id = a.contractor_id AND v.completed_at IS NOT NULL AND NOT v.is_redo
  ), redos AS (
    SELECT count(*) AS n FROM public.redo_requests r, a
    WHERE r.applicant_id = a.id AND r.status <> 'canceled' AND r.requested_at > now() - interval '60 days'
  ), x AS (
    SELECT a.*, CASE WHEN vr.n > 0 THEN round(vr.avg_stars, 2) ELSE a.avg_customer_rating END AS rating,
      coalesce(a.pro_since::timestamptz, first_visit.at) AS since, redos.n AS redo_n
    FROM a, vr, first_visit, redos
  )
  SELECT jsonb_build_object(
    'tier', tier, 'visits', visits, 'visits_needed', 50, 'visits_met', visits >= 50,
    'rating', rating, 'rating_met', coalesce(rating,0) >= 4.8,
    'days_active', coalesce(floor(extract(epoch from now() - since) / 86400)::int, 0),
    'days_met', coalesce(now() - since >= interval '60 days', false),
    'redos_60d', redo_n, 'redo_hold', redo_n > 2,
    'all_met', visits >= 50 AND coalesce(rating,0) >= 4.8 AND coalesce(now() - since >= interval '60 days', false) AND redo_n <= 2
  ) FROM x;
$$;

-- Route household counts: homes and visits per Pro per day, team-aware.
CREATE OR REPLACE FUNCTION public.admin_route_households(_from date, _to date)
RETURNS TABLE(pro_id uuid, pro_name text, visit_date date, homes integer, visits integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH assignment AS (
    SELECT v.assigned_pro_id AS pro, v.visit_date AS d, v.user_id, v.id
    FROM public.visits v
    WHERE v.visit_date BETWEEN _from AND _to AND v.status::text NOT IN ('canceled','skipped') AND v.assigned_pro_id IS NOT NULL
    UNION ALL
    SELECT coalesce(v.backup_pro_id, t.partner_pro_id), v.visit_date, v.user_id, v.id
    FROM public.visits v JOIN public.cleaning_teams t ON t.id = v.cleaning_team_id
    WHERE v.visit_date BETWEEN _from AND _to AND v.status::text NOT IN ('canceled','skipped') AND coalesce(v.backup_pro_id, t.partner_pro_id) IS NOT NULL
  )
  SELECT a.pro, (SELECT concat_ws(' ', ap.first_name, ap.last_name) FROM public.applicants ap WHERE ap.contractor_id = a.pro ORDER BY ap.created_at DESC LIMIT 1),
    a.d, count(DISTINCT a.user_id)::integer, count(*)::integer
  FROM assignment a
  WHERE public.current_user_admin()
  GROUP BY a.pro, a.d
  ORDER BY a.d, a.pro;
$$;
REVOKE ALL ON FUNCTION public.admin_route_households(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_route_households(date,date) TO authenticated;