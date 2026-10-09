CREATE TABLE public.lawn_plan_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('add_lawn','correction')),
  source text NOT NULL DEFAULT 'member_add' CHECK (source IN ('member_add','pro_report','admin')),
  cadence text NOT NULL CHECK (cadence IN ('monthly','biweekly','weekly')),
  selected_size text NOT NULL CHECK (selected_size IN ('1','2','3','custom')),
  measured_sqft integer CHECK (measured_sqft IS NULL OR measured_sqft > 0),
  verified_size text CHECK (verified_size IS NULL OR verified_size IN ('1','2','3','custom')),
  verified_at timestamptz,
  verified_by uuid,
  status text NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_verification','awaiting_customer','ready_to_apply','applied','declined','quote','no_change','failed','canceled')),
  confirm_token text UNIQUE,
  rate_card_version integer,
  lookup_key text,
  old_monthly_cents integer,
  new_monthly_cents integer,
  confirmed_at timestamptz,
  applied_at timestamptz,
  apply_error text,
  visit_id uuid,
  note text
);
CREATE UNIQUE INDEX lawn_plan_changes_one_open ON public.lawn_plan_changes (subscription_id)
  WHERE status IN ('pending_verification','awaiting_customer','ready_to_apply');
GRANT SELECT ON public.lawn_plan_changes TO authenticated;
GRANT ALL ON public.lawn_plan_changes TO service_role;
ALTER TABLE public.lawn_plan_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read lawn plan changes" ON public.lawn_plan_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members read their own lawn plan changes" ON public.lawn_plan_changes FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admin-only: record turf-only measured sq ft and decide what happens next.
-- Prices come from the member's OWN rate card (founding locks stay locked).
CREATE OR REPLACE FUNCTION public.admin_lawn_plan_verify(_change uuid, _measured integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.lawn_plan_changes; v text; rc int; newc int; oldc int; base text; nxt text; k text; key text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.is_service_caller() THEN
    RAISE EXCEPTION 'admins only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO c FROM public.lawn_plan_changes WHERE id = _change FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF c.status NOT IN ('pending_verification','awaiting_customer') THEN RAISE EXCEPTION 'already_%', c.status; END IF;
  v := public.lawn_size_from_sqft(_measured);
  rc := public.member_rate_card_version(c.user_id);
  base := CASE WHEN c.kind = 'add_lawn' THEN c.selected_size ELSE c.selected_size END;
  IF v = 'custom' THEN nxt := 'quote'; k := 'quote';
  ELSE
    newc := public.lawn_line_cents(v, c.cadence, rc);
    SELECT lookup_key INTO key FROM public.stripe_catalog
      WHERE canon_key = 'lawn_' || v || '_' || c.cadence AND rate_card_version = rc ORDER BY active DESC LIMIT 1;
    IF base <> 'custom' THEN oldc := public.lawn_line_cents(base, c.cadence, rc); END IF;
    IF base = 'custom' OR v::int > base::int THEN nxt := 'awaiting_customer'; k := 'size_up';
    ELSIF v::int < base::int THEN nxt := 'ready_to_apply'; k := 'size_down';
    ELSIF c.kind = 'add_lawn' THEN nxt := 'ready_to_apply'; k := 'same';
    ELSE nxt := 'no_change'; k := 'same'; END IF;
  END IF;
  UPDATE public.lawn_plan_changes SET measured_sqft = _measured, verified_size = v, verified_at = now(),
    verified_by = auth.uid(), status = nxt, rate_card_version = rc, lookup_key = key,
    old_monthly_cents = CASE WHEN c.kind = 'add_lawn' THEN NULL ELSE oldc END, new_monthly_cents = newc,
    confirm_token = CASE WHEN nxt = 'awaiting_customer' THEN coalesce(c.confirm_token, encode(extensions.gen_random_bytes(24), 'hex')) ELSE c.confirm_token END
   WHERE id = c.id RETURNING * INTO c;
  RETURN jsonb_build_object('kind', k, 'status', c.status, 'verified_size', v, 'measured_sqft', _measured,
    'new_cents', newc, 'old_cents', c.old_monthly_cents, 'token', c.confirm_token, 'change_kind', c.kind);
END $$;
REVOKE ALL ON FUNCTION public.admin_lawn_plan_verify(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_lawn_plan_verify(uuid, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lawn_plan_respond(_token text, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.lawn_plan_changes;
BEGIN
  SELECT * INTO c FROM public.lawn_plan_changes WHERE confirm_token = _token AND _token IS NOT NULL FOR UPDATE;
  IF c.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF c.status <> 'awaiting_customer' THEN RETURN jsonb_build_object('ok', true, 'already', c.status, 'id', c.id); END IF;
  UPDATE public.lawn_plan_changes SET status = CASE WHEN _accept THEN 'ready_to_apply' ELSE 'declined' END, confirmed_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('ok', true, 'result', CASE WHEN _accept THEN 'confirmed' ELSE 'declined' END, 'id', c.id, 'kind', c.kind);
END $$;
REVOKE ALL ON FUNCTION public.lawn_plan_respond(text, boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lawn_plan_respond(text, boolean) TO service_role;

-- Server-side gate: lawn can only join an existing subscription after aerial
-- verification (and customer confirmation on a size-up).
CREATE OR REPLACE FUNCTION public.subscriptions_guard_lawn_add()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF 'lawn' = ANY(NEW.services) AND NOT ('lawn' = ANY(coalesce(OLD.services, '{}'))) THEN
    IF NOT EXISTS (SELECT 1 FROM public.lawn_plan_changes
      WHERE subscription_id = NEW.id AND kind = 'add_lawn' AND verified_at IS NOT NULL AND status IN ('ready_to_apply','applied')) THEN
      RAISE EXCEPTION 'lawn cannot be added: lawn_unverified' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER subscriptions_guard_lawn_add BEFORE UPDATE OF services ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard_lawn_add();