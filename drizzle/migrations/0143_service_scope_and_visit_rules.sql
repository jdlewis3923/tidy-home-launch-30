
CREATE TABLE public.service_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL CHECK (service IN ('cleaning','lawn','car_wash','car_detail','cleaning_deep_clean')),
  section text NOT NULL CHECK (section IN ('included','not_included','add_on','customer_must','notice')),
  text_en text NOT NULL,
  text_es text NOT NULL,
  addon_key text,
  sort_order int NOT NULL DEFAULT 0,
  scope_version int NOT NULL DEFAULT 1,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_scope_lookup ON public.service_scope (service, scope_version, sort_order);
GRANT SELECT ON public.service_scope TO anon, authenticated;
GRANT ALL ON public.service_scope TO service_role;
ALTER TABLE public.service_scope ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scope readable by everyone" ON public.service_scope FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins manage scope" ON public.service_scope FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.scope_versions (
  service text NOT NULL,
  scope_version int NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  notice_sent_at timestamptz,
  existing_members_from timestamptz,
  change_note text,
  PRIMARY KEY (service, scope_version)
);
GRANT SELECT ON public.scope_versions TO anon, authenticated;
GRANT ALL ON public.scope_versions TO service_role;
ALTER TABLE public.scope_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scope versions readable" ON public.scope_versions FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.current_scope_version(_service text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(max(scope_version), 1) FROM public.scope_versions WHERE service = _service
$$;
GRANT EXECUTE ON FUNCTION public.current_scope_version(text) TO anon, authenticated, service_role;

CREATE TABLE public.scope_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid,
  email text,
  acceptance_ref text NOT NULL,
  service text NOT NULL,
  scope_version int NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  language text NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  surface text NOT NULL CHECK (surface IN ('founding','quote','checkout','upgrade')),
  water_consent boolean,
  checkbox_text text NOT NULL
);
CREATE INDEX scope_acceptances_ref ON public.scope_acceptances (acceptance_ref);
CREATE INDEX scope_acceptances_cust ON public.scope_acceptances (customer_id, service);
CREATE INDEX scope_acceptances_email ON public.scope_acceptances (lower(email), service);
GRANT SELECT ON public.scope_acceptances TO authenticated;
GRANT SELECT, INSERT ON public.scope_acceptances TO service_role;
ALTER TABLE public.scope_acceptances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read acceptances" ON public.scope_acceptances FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "members read own acceptances" ON public.scope_acceptances FOR SELECT TO authenticated USING (customer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.scope_acceptances_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'scope_acceptances_are_permanent'; END $$;
CREATE TRIGGER scope_acceptances_no_update BEFORE UPDATE OR DELETE ON public.scope_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.scope_acceptances_immutable();
CREATE TRIGGER scope_acceptances_no_truncate BEFORE TRUNCATE ON public.scope_acceptances
  FOR EACH STATEMENT EXECUTE FUNCTION public.scope_acceptances_immutable();

CREATE OR REPLACE FUNCTION public.member_scope_version(_user uuid, _service text)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH acc AS (
    SELECT max(a.scope_version) v FROM public.scope_acceptances a
    LEFT JOIN auth.users u ON u.id = _user
    WHERE a.service = _service AND (a.customer_id = _user OR lower(a.email) = lower(u.email))
  )
  SELECT COALESCE(
    (SELECT max(sv.scope_version) FROM public.scope_versions sv, acc
      WHERE sv.service = _service AND (acc.v IS NULL OR sv.scope_version <= acc.v
        OR (sv.existing_members_from IS NOT NULL AND sv.existing_members_from <= now()))),
    public.current_scope_version(_service))
$$;
GRANT EXECUTE ON FUNCTION public.member_scope_version(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_publish_scope(_service text, _rows jsonb, _note text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new int; r jsonb; v_notice timestamptz := now(); svc_key text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN RAISE EXCEPTION 'rows_required'; END IF;
  v_new := public.current_scope_version(_service) + 1;
  UPDATE public.service_scope SET active = false WHERE service = _service AND active;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    IF coalesce(trim(r->>'text_en'),'') = '' OR coalesce(trim(r->>'text_es'),'') = '' THEN RAISE EXCEPTION 'both_languages_required'; END IF;
    INSERT INTO public.service_scope (service, section, text_en, text_es, addon_key, sort_order, scope_version, active)
    VALUES (_service, r->>'section', trim(r->>'text_en'), trim(r->>'text_es'), nullif(r->>'addon_key',''),
            coalesce((r->>'sort_order')::int, 0), v_new, true);
  END LOOP;
  INSERT INTO public.scope_versions (service, scope_version, published_by, notice_sent_at, existing_members_from, change_note)
  VALUES (_service, v_new, auth.uid(), v_notice, v_notice + interval '30 days', _note);
  svc_key := CASE WHEN _service IN ('cleaning','cleaning_deep_clean') THEN 'cleaning'
                  WHEN _service = 'lawn' THEN 'lawn' ELSE 'detailing' END;
  INSERT INTO public.member_notifications (user_id, kind, title, body, dedupe_key)
  SELECT DISTINCT s.user_id, 'scope_change',
    'What your plan includes is changing',
    format('We updated what''s included in your plan. Your current terms stay in place until %s. See the new list on your Account page.', to_char(v_notice + interval '30 days','Mon DD, YYYY')),
    format('scope:%s:%s:%s', _service, v_new, s.user_id)
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.user_id IS NOT NULL
    AND (svc_key = ANY (coalesce(s.services, '{}')::text[]) OR (_service = 'car_wash' AND s.car_wash_key IS NOT NULL))
  ON CONFLICT DO NOTHING;
  RETURN v_new;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_publish_scope(text, jsonb, text) TO authenticated;

ALTER TABLE public.car_wash_profiles ADD COLUMN IF NOT EXISTS vehicle_plate text;
ALTER TABLE public.car_wash_profiles ADD COLUMN IF NOT EXISTS spigot_at_parking boolean;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS spigot_at_parking boolean;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS scope_acceptance_ref text;

ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_in_lat double precision,
  ADD COLUMN IF NOT EXISTS check_in_lng double precision,
  ADD COLUMN IF NOT EXISTS check_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_lat double precision,
  ADD COLUMN IF NOT EXISTS check_out_lng double precision,
  ADD COLUMN IF NOT EXISTS visit_outcome text CHECK (visit_outcome IN ('no_access','unsafe')),
  ADD COLUMN IF NOT EXISTS outcome_reason text,
  ADD COLUMN IF NOT EXISTS customer_told_at timestamptz,
  ADD COLUMN IF NOT EXISTS not_reached_note text;

CREATE OR REPLACE FUNCTION public.guard_visit_close_evidence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n_before int; n_after int; is_car boolean;
BEGIN
  IF COALESCE(NEW.is_sample, false) THEN RETURN NEW; END IF;
  IF NEW.status = 'complete' AND OLD.status IS DISTINCT FROM 'complete' THEN
    SELECT count(*) FILTER (WHERE kind='before'), count(*) FILTER (WHERE kind='after')
      INTO n_before, n_after FROM public.visit_photos WHERE visit_id = NEW.id;
    is_car := NEW.service_type = 'detailing' OR NEW.visit_kind IN ('car_wash','car_detail','detail');
    IF n_before < (CASE WHEN is_car THEN 6 ELSE 1 END) THEN RAISE EXCEPTION 'before_photos_required'; END IF;
    IF n_after < 1 THEN RAISE EXCEPTION 'after_photos_required'; END IF;
    IF NEW.check_in_at IS NULL OR NEW.check_in_lat IS NULL THEN RAISE EXCEPTION 'gps_check_in_required'; END IF;
    IF NEW.check_out_at IS NULL OR NEW.check_out_lat IS NULL THEN RAISE EXCEPTION 'gps_check_out_required'; END IF;
  END IF;
  IF NEW.visit_outcome IS NOT NULL AND OLD.visit_outcome IS NULL THEN
    SELECT count(*) INTO n_before FROM public.visit_photos WHERE visit_id = NEW.id;
    IF n_before < 1 THEN RAISE EXCEPTION 'outcome_photos_required'; END IF;
    IF NEW.check_in_at IS NULL OR NEW.check_in_lat IS NULL THEN RAISE EXCEPTION 'gps_check_in_required'; END IF;
    IF NEW.visit_outcome = 'no_access' AND NEW.check_in_at > now() - interval '15 minutes' THEN
      RAISE EXCEPTION 'wait_15_minutes';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER visits_close_evidence BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.guard_visit_close_evidence();

CREATE TABLE public.size_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id),
  user_id uuid,
  subscription_id uuid,
  service text NOT NULL CHECK (service IN ('cleaning','detailing')),
  booked_size smallint,
  observed_bedrooms int,
  observed_bathrooms numeric,
  observed_vehicle_class text,
  observed_plate text,
  observed_size smallint,
  matches boolean NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('recorded','open','dismissed','customer_notified','customer_confirmed','customer_canceled')),
  rate_card_version int,
  old_monthly_cents int,
  new_monthly_cents int,
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  customer_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id)
);
GRANT SELECT ON public.size_reviews TO authenticated;
GRANT UPDATE (status, admin_note, reviewed_by, reviewed_at) ON public.size_reviews TO authenticated;
GRANT ALL ON public.size_reviews TO service_role;
ALTER TABLE public.size_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read size reviews" ON public.size_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update size reviews" ON public.size_reviews FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "members see own notified size reviews" ON public.size_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND status IN ('customer_notified','customer_confirmed','customer_canceled'));

CREATE OR REPLACE FUNCTION public.admin_size_review_notify(_review uuid, _new_size smallint, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; s record; v_rc int; v_cad text; v_old int; v_new int; v_prefix text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT * INTO r FROM public.size_reviews WHERE id = _review FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status <> 'open' THEN RAISE EXCEPTION 'already_handled'; END IF;
  SELECT * INTO s FROM public.subscriptions WHERE id = r.subscription_id;
  v_rc := COALESCE(s.rate_card_version, 1);
  v_prefix := CASE WHEN r.service = 'cleaning' THEN 'clean' ELSE 'shine' END;
  v_cad := CASE WHEN r.service = 'cleaning' THEN '_' || COALESCE(s.cadence, s.frequency::text, 'monthly') ELSE '' END;
  SELECT price_cents INTO v_old FROM public.stripe_catalog WHERE canon_key = v_prefix||'_'||r.booked_size||v_cad AND rate_card_version = v_rc AND active LIMIT 1;
  SELECT price_cents INTO v_new FROM public.stripe_catalog WHERE canon_key = v_prefix||'_'||_new_size||v_cad AND rate_card_version = v_rc AND active LIMIT 1;
  IF v_new IS NULL THEN RAISE EXCEPTION 'price_not_found_for_rate_card'; END IF;
  UPDATE public.size_reviews SET status='customer_notified', observed_size=_new_size, rate_card_version=v_rc,
    old_monthly_cents=v_old, new_monthly_cents=v_new, admin_note=_note, reviewed_by=auth.uid(), reviewed_at=now()
  WHERE id = _review;
  INSERT INTO public.member_notifications (user_id, kind, title, body, related_visit_id, dedupe_key)
  VALUES (r.user_id, 'size_up_notice', 'Your plan size needs a quick check',
    format('At your first visit your Pro found a larger %s than your plan covers. The right plan is $%s a month (now $%s). Nothing changes until you confirm — or you can cancel instead. Open your Account page to choose.',
      CASE WHEN r.service='cleaning' THEN 'home' ELSE 'vehicle' END, to_char(v_new/100.0,'FM999990.00'), to_char(COALESCE(v_old,0)/100.0,'FM999990.00')),
    r.visit_id, 'size_up:'||_review)
  ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('ok', true, 'new_monthly_cents', v_new, 'old_monthly_cents', v_old, 'rate_card_version', v_rc);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_size_review_notify(uuid, smallint, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.member_size_review_respond(_review uuid, _confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.size_reviews WHERE id = _review FOR UPDATE;
  IF NOT FOUND OR r.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not_found'; END IF;
  IF r.status <> 'customer_notified' THEN RAISE EXCEPTION 'already_answered'; END IF;
  UPDATE public.size_reviews SET status = CASE WHEN _confirm THEN 'customer_confirmed' ELSE 'customer_canceled' END,
    customer_responded_at = now() WHERE id = _review;
  INSERT INTO public.admin_alerts (alert_type, title, body, level, category, action_label, action_url, dedupe_key, context)
  VALUES ('size_review_answer',
    CASE WHEN _confirm THEN 'Member confirmed a size-up' ELSE 'Member chose to cancel instead of a size-up' END,
    CASE WHEN _confirm THEN 'Apply the new size before the next charge.' ELSE 'Process the cancellation. Do not reprice.' END,
    'action', 'billing', 'Open size review', '/admin/size-review', 'size_answer:'||_review,
    jsonb_build_object('review_id', _review, 'confirm', _confirm));
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.member_size_review_respond(uuid, boolean) TO authenticated;

ALTER TABLE public.redo_requests ADD COLUMN IF NOT EXISTS missed_items text[];
ALTER TABLE public.redo_requests ADD COLUMN IF NOT EXISTS photo_path text;

CREATE TABLE public.damage_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id),
  user_id uuid NOT NULL,
  description text NOT NULL CHECK (length(trim(description)) >= 10 AND length(description) <= 2000),
  photo_paths text[] NOT NULL CHECK (array_length(photo_paths,1) >= 1),
  reported_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','closed')),
  admin_notes text,
  closed_at timestamptz
);
GRANT SELECT, INSERT ON public.damage_claims TO authenticated;
GRANT UPDATE (status, admin_notes, closed_at) ON public.damage_claims TO authenticated;
GRANT ALL ON public.damage_claims TO service_role;
ALTER TABLE public.damage_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members file own claims" ON public.damage_claims FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "members read own claims" ON public.damage_claims FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admins read claims" ON public.damage_claims FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update claims" ON public.damage_claims FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.guard_damage_claim()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; p text;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = NEW.visit_id;
  IF NOT FOUND OR v.user_id IS DISTINCT FROM NEW.user_id THEN RAISE EXCEPTION 'visit_not_yours'; END IF;
  IF COALESCE(v.completed_at, v.check_out_at) IS NULL THEN RAISE EXCEPTION 'visit_not_finished'; END IF;
  IF now() > COALESCE(v.completed_at, v.check_out_at) + interval '24 hours' THEN RAISE EXCEPTION 'claim_window_closed'; END IF;
  FOREACH p IN ARRAY NEW.photo_paths LOOP
    IF split_part(p, '/', 1) <> NEW.user_id::text THEN RAISE EXCEPTION 'bad_photo_path'; END IF;
  END LOOP;
  NEW.reported_at := now(); NEW.status := 'open';
  INSERT INTO public.admin_alerts (alert_type, title, body, level, category, action_label, action_url, dedupe_key, context)
  VALUES ('damage_claim', 'Damage claim filed', left(NEW.description, 300), 'action', 'operations',
          'Open claims', '/admin/claims', 'damage:'||NEW.visit_id||':'||NEW.user_id, jsonb_build_object('visit_id', NEW.visit_id));
  RETURN NEW;
END $$;
CREATE TRIGGER damage_claims_guard BEFORE INSERT ON public.damage_claims
  FOR EACH ROW EXECUTE FUNCTION public.guard_damage_claim();

CREATE POLICY "members upload own claim photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'claim-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "members and admins read claim photos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'claim-photos' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
