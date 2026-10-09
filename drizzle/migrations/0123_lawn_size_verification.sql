ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS lawn_selected_size text CHECK (lawn_selected_size IN ('1','2','3','custom')),
  ADD COLUMN IF NOT EXISTS lawn_measured_sqft integer CHECK (lawn_measured_sqft IS NULL OR lawn_measured_sqft > 0),
  ADD COLUMN IF NOT EXISTS lawn_verified_size text CHECK (lawn_verified_size IN ('1','2','3','custom')),
  ADD COLUMN IF NOT EXISTS lawn_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS lawn_verified_by uuid,
  ADD COLUMN IF NOT EXISTS lawn_size_variance smallint,
  ADD COLUMN IF NOT EXISTS lawn_size_confirmation text CHECK (lawn_size_confirmation IN ('not_needed','pending','confirmed','declined')),
  ADD COLUMN IF NOT EXISTS lawn_confirm_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS lawn_old_monthly_cents integer,
  ADD COLUMN IF NOT EXISTS lawn_new_monthly_cents integer,
  ADD COLUMN IF NOT EXISTS lawn_confirmed_at timestamptz;

COMMENT ON COLUMN public.reservations.lawn_size_variance IS 'verified_size - selected_size (-2..+2); null when either side is custom';

UPDATE public.reservations r SET lawn_selected_size = coalesce((
    SELECT CASE WHEN x->>'size' IN ('1','2','3') THEN x->>'size' ELSE 'custom' END
      FROM jsonb_array_elements(r.lines) x WHERE x->>'service' = 'lawn' LIMIT 1), 'custom')
WHERE r.lawn_selected_size IS NULL AND 'lawn' = ANY(r.services);

CREATE TABLE IF NOT EXISTS public.lawn_size_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('size_up','size_down','size_same','quote')),
  email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sent','failed','skipped')),
  email_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT ON public.lawn_size_notices TO authenticated;
GRANT ALL ON public.lawn_size_notices TO service_role;
ALTER TABLE public.lawn_size_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read lawn size notices" ON public.lawn_size_notices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.lawn_size_from_sqft(_sqft integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN _sqft IS NULL OR _sqft <= 0 THEN NULL
              WHEN _sqft <= 3000 THEN '1' WHEN _sqft <= 7000 THEN '2'
              WHEN _sqft <= 12000 THEN '3' ELSE 'custom' END
$$;
GRANT EXECUTE ON FUNCTION public.lawn_size_from_sqft(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lawn_line_cents(_size text, _cadence text, _rate_card integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT price_cents FROM public.stripe_catalog
   WHERE canon_key = 'lawn_' || _size || '_' || coalesce(_cadence,'monthly')
     AND rate_card_version = _rate_card
   ORDER BY active DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.lawn_line_cents(text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawn_line_cents(text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.lawn_apply_size(_reservation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations; nl jsonb;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE id = _reservation FOR UPDATE;
  IF r.lawn_verified_size IS NULL OR r.lawn_verified_size = 'custom' OR r.lawn_new_monthly_cents IS NULL THEN RETURN; END IF;
  SELECT jsonb_agg(CASE WHEN x->>'service' = 'lawn'
           THEN x || jsonb_build_object('size', r.lawn_verified_size::int, 'monthly', r.lawn_new_monthly_cents / 100.0, 'cadence', coalesce(x->>'cadence','monthly'))
           ELSE x END)
    INTO nl FROM jsonb_array_elements(r.lines) x;
  UPDATE public.reservations SET lines = coalesce(nl, lines),
    monthly_cents = (SELECT coalesce(sum(round((y->>'monthly')::numeric * 100)), 0)::int FROM jsonb_array_elements(coalesce(nl, r.lines)) y WHERE y->>'size' <> 'quote')
  WHERE id = r.id;
END $$;
REVOKE ALL ON FUNCTION public.lawn_apply_size(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawn_apply_size(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_lawn_verify(_reservation uuid, _measured integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations; v text; sel text; cad text; rc int; old_c int; new_c int; kind text; conf text; tok text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_service_caller()) THEN RAISE EXCEPTION 'admin only' USING ERRCODE = '42501'; END IF;
  IF _measured IS NULL OR _measured <= 0 OR _measured > 200000 THEN RAISE EXCEPTION 'measured_sqft must be a positive turf area'; END IF;
  SELECT * INTO r FROM public.reservations WHERE id = _reservation FOR UPDATE;
  IF r.id IS NULL OR NOT ('lawn' = ANY(r.services)) THEN RAISE EXCEPTION 'not a lawn reservation'; END IF;
  IF r.status NOT IN ('reserved','invited') THEN RAISE EXCEPTION 'reservation is %', r.status; END IF;
  v := public.lawn_size_from_sqft(_measured);
  sel := coalesce(r.lawn_selected_size, 'custom');
  SELECT coalesce(x->>'cadence','monthly') INTO cad FROM jsonb_array_elements(r.lines) x WHERE x->>'service'='lawn' LIMIT 1;
  cad := coalesce(cad, 'monthly');
  -- Founding homes keep their own rate card: read it from the reservation, never the published card.
  rc := coalesce(r.rate_card_version, public.current_rate_card_version());
  old_c := CASE WHEN sel = 'custom' THEN NULL ELSE public.lawn_line_cents(sel, cad, rc) END;
  new_c := CASE WHEN v = 'custom' THEN NULL ELSE public.lawn_line_cents(v, cad, rc) END;
  IF v = 'custom' THEN kind := 'quote'; conf := 'pending';
  ELSIF sel = 'custom' OR v::int > sel::int THEN kind := 'size_up'; conf := 'pending';
  ELSIF v::int < sel::int THEN kind := 'size_down'; conf := 'not_needed';
  ELSE kind := 'size_same'; conf := 'not_needed'; END IF;
  tok := CASE WHEN kind = 'size_up' THEN encode(extensions.gen_random_bytes(18), 'hex') ELSE NULL END;
  UPDATE public.reservations SET
    lawn_measured_sqft = _measured, lawn_verified_size = v, lawn_verified_at = now(), lawn_verified_by = auth.uid(),
    lawn_selected_size = sel,
    lawn_size_variance = CASE WHEN v = 'custom' OR sel = 'custom' THEN NULL ELSE v::int - sel::int END,
    lawn_size_confirmation = conf, lawn_confirm_token = tok, lawn_confirmed_at = NULL,
    lawn_old_monthly_cents = old_c, lawn_new_monthly_cents = new_c,
    custom_quote = CASE WHEN kind = 'quote' THEN true ELSE custom_quote END
  WHERE id = r.id;
  IF kind = 'size_down' THEN PERFORM public.lawn_apply_size(r.id); END IF;
  RETURN jsonb_build_object('reservation_id', r.id, 'kind', kind, 'selected_size', sel, 'verified_size', v,
    'measured_sqft', _measured, 'old_cents', old_c, 'new_cents', new_c, 'rate_card_version', rc, 'cadence', cad, 'token', tok);
END $$;
REVOKE ALL ON FUNCTION public.admin_lawn_verify(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_lawn_verify(uuid,integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lawn_size_respond(_token text, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.reservations;
BEGIN
  SELECT * INTO r FROM public.reservations WHERE lawn_confirm_token = _token AND _token IS NOT NULL FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF r.lawn_size_confirmation <> 'pending' THEN RETURN jsonb_build_object('ok', true, 'already', r.lawn_size_confirmation); END IF;
  IF _accept THEN
    UPDATE public.reservations SET lawn_size_confirmation = 'confirmed', lawn_confirmed_at = now() WHERE id = r.id;
    PERFORM public.lawn_apply_size(r.id);
    RETURN jsonb_build_object('ok', true, 'result', 'confirmed');
  END IF;
  UPDATE public.reservations SET lawn_size_confirmation = 'declined', lawn_confirmed_at = now(), status = 'canceled' WHERE id = r.id;
  RETURN jsonb_build_object('ok', true, 'result', 'declined');
END $$;
REVOKE ALL ON FUNCTION public.lawn_size_respond(text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawn_size_respond(text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.lawn_conversion_block(r public.reservations)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN NOT ('lawn' = ANY(r.services)) THEN NULL
    WHEN r.lawn_verified_at IS NULL THEN 'lawn_unverified'
    WHEN r.lawn_verified_size = 'custom' THEN 'lawn_custom_quote'
    WHEN r.lawn_size_confirmation = 'pending' THEN 'lawn_size_unconfirmed'
    WHEN r.lawn_size_confirmation = 'declined' THEN 'lawn_size_declined'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public.reservations_guard_lawn_conversion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE why text;
BEGIN
  IF NEW.status = 'converted' AND OLD.status IS DISTINCT FROM 'converted' THEN
    why := public.lawn_conversion_block(NEW);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'lawn reservation cannot convert: %', why USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS reservations_guard_lawn_conversion ON public.reservations;
CREATE TRIGGER reservations_guard_lawn_conversion BEFORE UPDATE OF status ON public.reservations
FOR EACH ROW EXECUTE FUNCTION public.reservations_guard_lawn_conversion();

CREATE OR REPLACE FUNCTION public.subscriptions_guard_lawn_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _email text; r public.reservations; why text;
BEGIN
  IF NEW.status::text <> 'active' OR NEW.user_id IS NULL OR NOT ('lawn' = ANY(NEW.services::text[])) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status::text = 'active' THEN RETURN NEW; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.user_id;
  FOR r IN SELECT * FROM public.reservations WHERE lower(email) = _email AND status IN ('reserved','invited') LOOP
    why := public.lawn_conversion_block(r);
    IF why IS NOT NULL THEN RAISE EXCEPTION 'lawn subscription blocked: reservation % is %', r.id, why USING ERRCODE = 'P0001'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS subscriptions_guard_lawn_reservation ON public.subscriptions;
CREATE TRIGGER subscriptions_guard_lawn_reservation BEFORE INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard_lawn_reservation();

CREATE OR REPLACE FUNCTION public.lawn_checkout_gate(_email text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT jsonb_build_object('reservation_id', r.id, 'block', public.lawn_conversion_block(r),
            'verified_size', r.lawn_verified_size, 'measured_sqft', r.lawn_measured_sqft)
     FROM public.reservations r
    WHERE lower(r.email) = lower(_email) AND r.status IN ('reserved','invited') AND 'lawn' = ANY(r.services)
    ORDER BY r.created_at LIMIT 1), '{}'::jsonb)
$$;
REVOKE ALL ON FUNCTION public.lawn_checkout_gate(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawn_checkout_gate(text) TO service_role;

CREATE INDEX IF NOT EXISTS reservations_lawn_unverified_idx ON public.reservations (created_at) WHERE lawn_verified_at IS NULL;