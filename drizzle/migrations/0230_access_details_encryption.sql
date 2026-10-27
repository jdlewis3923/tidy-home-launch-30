CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Key table: no anon/authenticated grants. Only security-definer functions
-- (owner) and the service role can read it, so ciphertext in member-readable
-- tables is useless without it.
CREATE TABLE public.app_crypto_keys (
  id text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_crypto_keys ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.app_crypto_keys TO service_role;
INSERT INTO public.app_crypto_keys (id, secret) VALUES ('access_v1', encode(gen_random_bytes(32), 'hex'));

CREATE OR REPLACE FUNCTION public.access_encrypt(_plain text) RETURNS bytea
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE WHEN _plain IS NULL OR _plain = '' THEN NULL
    ELSE pgp_sym_encrypt(_plain, (SELECT secret FROM public.app_crypto_keys WHERE id = 'access_v1')) END
$$;
REVOKE ALL ON FUNCTION public.access_encrypt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_encrypt(text) TO service_role;

CREATE OR REPLACE FUNCTION public.access_decrypt(_cipher bytea) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT CASE WHEN _cipher IS NULL THEN NULL
    ELSE pgp_sym_decrypt(_cipher, (SELECT secret FROM public.app_crypto_keys WHERE id = 'access_v1')) END
$$;
REVOKE ALL ON FUNCTION public.access_decrypt(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.access_decrypt(bytea) TO service_role;

ALTER TABLE public.customer_bookings ADD COLUMN IF NOT EXISTS access_enc bytea;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS gate_code_enc bytea;
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS access_notes_enc bytea;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gate_code_enc bytea;
REVOKE SELECT (gate_code_enc) ON public.profiles FROM authenticated, anon;

-- Member reads/updates only their own code, decrypted server-side.
CREATE OR REPLACE FUNCTION public.my_gate_code() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.access_decrypt(p.gate_code_enc) FROM public.profiles p WHERE p.id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.my_gate_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_gate_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_gate_code(_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _code IS NOT NULL AND length(btrim(_code)) > 200 THEN RAISE EXCEPTION 'too_long'; END IF;
  UPDATE public.profiles
  SET gate_code_enc = public.access_encrypt(NULLIF(btrim(_code), '')), gate_code = NULL
  WHERE id = auth.uid();
END $$;
REVOKE ALL ON FUNCTION public.set_my_gate_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_gate_code(text) TO authenticated;

-- Service-role reader for day-of Pro texts (notify-pro-job-today, pro-day-digest).
CREATE OR REPLACE FUNCTION public.visit_access_details(_visit uuid) RETURNS TABLE(gate_code text, access_notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.access_decrypt(v.gate_code_enc), public.access_decrypt(v.access_notes_enc)
  FROM public.visits v WHERE v.id = _visit
$$;
REVOKE ALL ON FUNCTION public.visit_access_details(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visit_access_details(uuid) TO service_role;

-- Booking RPC: sensitive entry details move into the encrypted blob; the
-- plaintext details JSON keeps only vehicle/parking information.
CREATE OR REPLACE FUNCTION public.customer_book_day(_service public.service_type, _weekday int, _window text, _details jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); o jsonb; opt jsonb; claim uuid; fd date; old public.customer_bookings; oc public.pro_day_claims; nc public.pro_day_claims;
        nb uuid; nxt timestamptz; d jsonb := '{}'::jsonb; sens jsonb := '{}'::jsonb; k text; pro_name text; t record; same_day boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT (_window = ANY(public.sched_windows(_service))) THEN RAISE EXCEPTION 'invalid_window'; END IF;
  FOREACH k IN ARRAY ARRAY['gate_code','gate_location','entry_method','entry_note','vehicle','parking_spot','interior_access'] LOOP
    IF coalesce(_details->>k, '') <> '' THEN d := d || jsonb_build_object(k, left(btrim(_details->>k), 200)); END IF;
  END LOOP;
  IF _service::text = 'cleaning' AND coalesce(d->>'entry_method','') NOT IN ('home','lockbox','code','key') THEN RAISE EXCEPTION 'entry_method_required'; END IF;
  sens := d - 'vehicle' - 'parking_spot' - 'interior_access';
  d := d - 'gate_code' - 'gate_location' - 'entry_method' - 'entry_note';
  o := public.sched_options(uid, _service);
  IF o ? 'error' THEN RAISE EXCEPTION '%', o->>'error'; END IF;
  FOR opt IN SELECT * FROM jsonb_array_elements(o->'options') LOOP
    IF (opt->>'weekday')::int = _weekday THEN
      claim := (opt->>'claim_id')::uuid;
      SELECT (x->>'first_date')::date INTO fd FROM jsonb_array_elements(opt->'windows') x WHERE x->>'key' = _window;
    END IF;
  END LOOP;
  IF claim IS NULL THEN RAISE EXCEPTION 'day_not_offered'; END IF;
  IF fd IS NULL THEN RAISE EXCEPTION 'no_room'; END IF;
  SELECT * INTO nc FROM public.pro_day_claims WHERE id = claim;
  SELECT * INTO old FROM public.customer_bookings WHERE subscription_id = (o->>'subscription_id')::uuid AND service = _service AND status = 'active';
  IF old.id IS NOT NULL THEN
    SELECT min(scheduled_start) INTO nxt FROM public.visits WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now();
    IF nxt IS NOT NULL AND nxt <= now() + interval '48 hours' THEN RAISE EXCEPTION 'inside_48h'; END IF;
    SELECT * INTO oc FROM public.pro_day_claims WHERE id = old.claim_id;
    same_day := old.claim_id = claim;
    IF same_day THEN
      UPDATE public.customer_bookings SET window_key = _window, details = old.details || d,
        access_enc = public.access_encrypt((coalesce(public.access_decrypt(old.access_enc), '{}')::jsonb || sens)::text), updated_at = now() WHERE id = old.id;
      UPDATE public.visits SET window_key = _window WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now() + interval '48 hours';
      nb := old.id; fd := coalesce((SELECT min(visit_date) FROM public.visits WHERE booking_id = old.id AND status::text = 'scheduled' AND visit_date >= public.sched_today()), fd);
    ELSE
      UPDATE public.visits SET status = 'canceled', lifecycle_reason = 'day_changed' WHERE booking_id = old.id AND status::text = 'scheduled' AND scheduled_start > now() + interval '48 hours';
      UPDATE public.customer_bookings SET status = 'ended', ended_at = now(), end_reason = 'day_changed' WHERE id = old.id;
      UPDATE public.reschedule_items SET status = 'resolved', resolved_at = now(), resolution_note = 'Customer chose a new day' WHERE booking_id = old.id AND status = 'open';
    END IF;
  END IF;
  IF nb IS NULL THEN
    INSERT INTO public.customer_bookings (user_id, subscription_id, service, zip, weekday, window_key, cadence, budget_hours, first_visit_date, claim_id, details, access_enc)
    VALUES (uid, (o->>'subscription_id')::uuid, _service, o->>'zip', _weekday, _window, o->>'cadence', (o->>'budget_hours')::numeric, fd, claim,
            coalesce(old.details, '{}'::jsonb) || d,
            public.access_encrypt((coalesce(public.access_decrypt(old.access_enc), '{}')::jsonb || sens)::text))
    RETURNING id INTO nb;
    PERFORM public.sched_generate_booking(nb, public.sched_today() + 45);
  END IF;
  UPDATE public.sched_waitlist SET status = 'booked' WHERE user_id = uid AND service = _service AND status IN ('waiting','offered');
  pro_name := public.sched_pro_first_name(nc.pro_user_id);
  SELECT * INTO t FROM public.sched_window_times(_service, _window);
  PERFORM public.sched_customer_notice(uid, 'day_confirmed', 'Your Tidy day is confirmed',
    format('%s every %s%s, %s. First visit %s. Your Pro is %s.', public.sched_svc_label(_service), public.sched_day_name(_weekday),
      CASE WHEN _service::text = 'lawn' THEN '' ELSE ' (' || t.label || ')' END, o->>'cadence', public.sched_fmt(fd), pro_name),
    'confirmed-' || nb || '-' || _window, NULL,
    format('Tidy: your %s day is %s, %s. First visit %s. Your Pro is %s.', lower(public.sched_svc_label(_service)), public.sched_day_name(_weekday), t.label, public.sched_fmt(fd), pro_name), NULL);
  IF old.id IS NOT NULL AND oc.pro_user_id IS DISTINCT FROM nc.pro_user_id THEN
    PERFORM public.sched_customer_notice(uid, 'pro_changed', 'Your Pro has changed',
      format('Your %s Pro is now %s.', lower(public.sched_svc_label(_service)), pro_name), 'prochange-' || nb, NULL,
      format('Tidy: your %s Pro is now %s.', lower(public.sched_svc_label(_service)), pro_name), NULL);
  END IF;
  IF old.id IS NULL OR NOT same_day THEN
    PERFORM public.sched_pro_notice(nc.pro_user_id, 'new_customer', format('New customer on your %s', public.sched_day_name(_weekday)),
      format('A %s customer in %s was added to your %s, starting %s.', lower(public.sched_svc_label(_service)), o->>'zip', public.sched_day_name(_weekday), public.sched_fmt(fd)),
      '/pro/schedule', 'newcust-' || nb);
  END IF;
  RETURN jsonb_build_object('ok', true, 'booking_id', nb, 'weekday', _weekday, 'day', public.sched_day_name(_weekday), 'window', _window,
    'window_label', t.label, 'first_visit_date', fd, 'pro_first_name', pro_name);
END $$;

-- Visit fill trigger: decrypt the booking blob, re-encrypt onto the visit.
CREATE OR REPLACE FUNCTION public.sched_visit_booking_fill() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.customer_bookings; c public.pro_day_claims; t record; v_bid uuid; ad jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.booking_id IS NULL AND NEW.subscription_id IS NOT NULL AND NOT coalesce(NEW.is_redo, false)
       AND coalesce(NEW.visit_kind, '') <> 'car_wash' AND NEW.service IS NOT NULL THEN
      SELECT id INTO v_bid FROM public.customer_bookings WHERE subscription_id = NEW.subscription_id AND service = NEW.service AND status = 'active' LIMIT 1;
      NEW.booking_id := v_bid;
    END IF;
    IF NEW.booking_id IS NOT NULL THEN
      SELECT * INTO b FROM public.customer_bookings WHERE id = NEW.booking_id;
      SELECT * INTO c FROM public.pro_day_claims WHERE id = b.claim_id;
      NEW.claim_id := coalesce(NEW.claim_id, b.claim_id);
      NEW.assigned_pro_id := coalesce(NEW.assigned_pro_id, c.pro_user_id);
      NEW.zip := coalesce(NEW.zip, b.zip);
      NEW.window_key := coalesce(NEW.window_key, b.window_key);
      NEW.budget_hours := coalesce(NEW.budget_hours, public.sched_budget(b.service, NEW.size_tier, coalesce(NEW.visit_kind, public.sched_std_kind(b.service))));
      ad := coalesce(public.access_decrypt(b.access_enc)::jsonb, '{}'::jsonb);
      NEW.gate_code_enc := coalesce(NEW.gate_code_enc, public.access_encrypt(NULLIF(ad->>'gate_code', '')));
      NEW.access_notes_enc := coalesce(NEW.access_notes_enc, public.access_encrypt(NULLIF(concat_ws(' · ', NULLIF(ad->>'gate_location',''), NULLIF(ad->>'entry_method',''), NULLIF(ad->>'entry_note','')), '')));
      NEW.parking_notes := coalesce(NEW.parking_notes, NULLIF(concat_ws(' · ', NULLIF(b.details->>'vehicle',''), NULLIF(b.details->>'parking_spot',''), NULLIF(b.details->>'interior_access','')), ''));
    END IF;
  END IF;
  IF NEW.booking_id IS NOT NULL AND NEW.window_key IS NOT NULL AND NEW.service IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.visit_date IS DISTINCT FROM OLD.visit_date OR NEW.window_key IS DISTINCT FROM OLD.window_key) THEN
    SELECT * INTO t FROM public.sched_window_times(NEW.service, NEW.window_key);
    NEW.time_window := t.label;
    NEW.scheduled_start := (NEW.visit_date::timestamp + make_interval(hours => t.start_h)) AT TIME ZONE 'America/New_York';
    NEW.scheduled_end := (NEW.visit_date::timestamp + make_interval(hours => t.end_h)) AT TIME ZONE 'America/New_York';
  END IF;
  RETURN NEW;
END $$;

-- Pro visit reader: decrypt only on visit day (Miami date), never before.
CREATE OR REPLACE FUNCTION public.pro_get_visits(_from date DEFAULT (CURRENT_DATE-60),_to date DEFAULT (CURRENT_DATE+60)) RETURNS TABLE(id uuid,scheduled_start timestamptz,scheduled_end timestamptz,service_type text,street text,zip text,customer_first_name text,access_notes text,gate_code text,pet_notes text,parking_notes text,visit_pay_cents integer,status text,on_my_way_at timestamptz,completed_at timestamptz,is_sample boolean,before_photos integer,after_photos integer,visit_kind text,paid_in_full_reason text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT v.id,v.scheduled_start,v.scheduled_end,v.service_type,v.street,v.zip,v.customer_first_name,CASE WHEN v.visit_date=(now() AT TIME ZONE 'America/New_York')::date THEN public.access_decrypt(v.access_notes_enc) END,CASE WHEN v.visit_date=(now() AT TIME ZONE 'America/New_York')::date THEN public.access_decrypt(v.gate_code_enc) END,v.pet_notes,v.parking_notes,CASE WHEN v.size_tier=5 AND t.kind='paired_pros' THEN coalesce(public.pro_tier_uplift_cents(v.contractor_pay_cents,auth.uid()),v.visit_pay_cents)/2 ELSE v.visit_pay_cents END,v.status::text,v.on_my_way_at,v.completed_at,v.is_sample,(SELECT count(*)::integer FROM public.visit_photos p WHERE p.visit_id=v.id AND p.kind='before'),(SELECT count(*)::integer FROM public.visit_photos p WHERE p.visit_id=v.id AND p.kind='after'),v.visit_kind,v.paid_in_full_reason FROM public.visits v LEFT JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id WHERE (v.assigned_pro_id=auth.uid() OR t.partner_pro_id=auth.uid()) AND (v.scheduled_start IS NULL OR v.scheduled_start::date BETWEEN _from AND _to) ORDER BY v.scheduled_start NULLS LAST $$;

-- Backfill encrypted columns from plaintext, then clear the plaintext.
UPDATE public.visits SET gate_code_enc = public.access_encrypt(gate_code) WHERE gate_code IS NOT NULL AND gate_code <> '' AND gate_code_enc IS NULL;
UPDATE public.visits SET access_notes_enc = public.access_encrypt(access_notes) WHERE access_notes IS NOT NULL AND access_notes <> '' AND access_notes_enc IS NULL;
UPDATE public.profiles SET gate_code_enc = public.access_encrypt(gate_code) WHERE gate_code IS NOT NULL AND gate_code <> '' AND gate_code_enc IS NULL;
UPDATE public.customer_bookings SET access_enc = public.access_encrypt((details - 'vehicle' - 'parking_spot' - 'interior_access')::text)
  WHERE details ?| ARRAY['gate_code','gate_location','entry_method','entry_note'] AND access_enc IS NULL;

UPDATE public.visits SET gate_code = NULL, access_notes = NULL WHERE gate_code IS NOT NULL OR access_notes IS NOT NULL;
UPDATE public.profiles SET gate_code = NULL WHERE gate_code IS NOT NULL;
UPDATE public.customer_bookings SET details = details - 'gate_code' - 'gate_location' - 'entry_method' - 'entry_note'
  WHERE details ?| ARRAY['gate_code','gate_location','entry_method','entry_note'];

COMMENT ON COLUMN public.visits.gate_code IS 'DEPRECATED: replaced by gate_code_enc (encrypted at rest; visit-day only via pro_get_visits).';
COMMENT ON COLUMN public.visits.access_notes IS 'DEPRECATED: replaced by access_notes_enc (encrypted at rest; visit-day only via pro_get_visits).';
COMMENT ON COLUMN public.profiles.gate_code IS 'DEPRECATED: replaced by gate_code_enc (encrypted at rest; member reads via my_gate_code).';
COMMENT ON COLUMN public.customer_bookings.access_enc IS 'Encrypted entry details (gate code, location, entry method, entry note). Key lives in app_crypto_keys, unreachable through the Data API.';