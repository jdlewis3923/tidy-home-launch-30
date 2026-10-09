CREATE OR REPLACE FUNCTION public.admin_lawn_plan_verify(_change uuid, _measured integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.lawn_plan_changes; v text; rc int; newc int; oldc int; base text; nxt text; k text; key text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.lawn_plan_changes WHERE id = _change FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF c.status NOT IN ('pending_verification','awaiting_customer','failed') THEN RAISE EXCEPTION 'already_%', c.status; END IF;
  v := public.lawn_size_from_sqft(_measured);
  rc := public.member_rate_card_version(c.user_id);
  base := c.selected_size;
  IF v = 'custom' THEN nxt := 'quote'; k := 'quote';
  ELSE
    newc := public.lawn_line_cents(v, c.cadence, rc);
    SELECT lookup_key INTO key FROM public.stripe_catalog
      WHERE canon_key = 'lawn_' || v || '_' || c.cadence AND rate_card_version = rc ORDER BY active DESC LIMIT 1;
    IF base <> 'custom' THEN oldc := public.lawn_line_cents(base, c.cadence, rc); END IF;
    IF base = 'custom' THEN nxt := 'awaiting_customer'; k := 'size_up';
    ELSIF v::int > base::int THEN nxt := 'awaiting_customer'; k := 'size_up';
    ELSIF v::int < base::int THEN nxt := 'ready_to_apply'; k := 'size_down';
    ELSIF c.kind = 'add_lawn' THEN nxt := 'ready_to_apply'; k := 'same';
    ELSE nxt := 'no_change'; k := 'same'; END IF;
  END IF;
  UPDATE public.lawn_plan_changes SET measured_sqft = _measured, verified_size = v, verified_at = now(),
    verified_by = auth.uid(), status = nxt, rate_card_version = rc, lookup_key = key, apply_error = NULL,
    old_monthly_cents = CASE WHEN c.kind = 'add_lawn' THEN NULL ELSE oldc END, new_monthly_cents = newc,
    confirm_token = CASE WHEN nxt = 'awaiting_customer' THEN coalesce(c.confirm_token, encode(extensions.gen_random_bytes(24), 'hex')) ELSE c.confirm_token END
   WHERE id = c.id RETURNING * INTO c;
  RETURN jsonb_build_object('kind', k, 'status', c.status, 'verified_size', v, 'measured_sqft', _measured,
    'new_cents', newc, 'old_cents', c.old_monthly_cents, 'token', c.confirm_token, 'change_kind', c.kind);
END $function$;