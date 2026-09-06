-- Route ownership: a customer gets one Pro, and every visit inherits it.
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS assigned_pro_id uuid;
CREATE INDEX IF NOT EXISTS subscriptions_assigned_pro_idx ON public.subscriptions(assigned_pro_id);
UPDATE public.subscriptions
   SET assigned_pro_id = preferred_pro_id
 WHERE assigned_pro_id IS NULL AND preferred_pro_id IS NOT NULL;

-- 1099 paperwork status, surfaced in admin only.
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS w9_status text NOT NULL DEFAULT 'not_started';
ALTER TABLE public.applicants ADD COLUMN IF NOT EXISTS stripe_connect_status text NOT NULL DEFAULT 'not_started';

-- Visits inherit the route's Pro on insert (jobber-webhook is the only writer).
CREATE OR REPLACE FUNCTION public.visits_inherit_assigned_pro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_applicant uuid; v_uid uuid;
BEGIN
  IF NEW.assigned_pro_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(s.assigned_pro_id, s.preferred_pro_id) INTO v_applicant
  FROM public.subscriptions s
  WHERE (NEW.subscription_id IS NOT NULL AND s.id = NEW.subscription_id)
     OR (NEW.subscription_id IS NULL AND NEW.user_id IS NOT NULL AND s.user_id = NEW.user_id AND s.status = 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_applicant IS NULL THEN RETURN NEW; END IF;

  SELECT a.contractor_id INTO v_uid FROM public.applicants a WHERE a.id = v_applicant;
  NEW.assigned_pro_id := v_uid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_inherit_assigned_pro ON public.visits;
CREATE TRIGGER trg_visits_inherit_assigned_pro
BEFORE INSERT ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.visits_inherit_assigned_pro();

-- Admin: assign a customer's Pro once, and carry it to their future visits.
CREATE OR REPLACE FUNCTION public.admin_assign_customer_pro(_subscription_id uuid, _applicant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid; v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF _applicant_id IS NOT NULL THEN
    SELECT a.contractor_id INTO v_uid FROM public.applicants a WHERE a.id = _applicant_id;
  END IF;

  UPDATE public.subscriptions SET assigned_pro_id = _applicant_id WHERE id = _subscription_id
  RETURNING user_id INTO v_user;

  UPDATE public.visits v
     SET assigned_pro_id = v_uid
   WHERE v.subscription_id = _subscription_id
     AND v.completed_at IS NULL
     AND (v.scheduled_start IS NULL OR v.scheduled_start >= now());
END;
$$;

-- Admin: override a single visit (coverage, sick day) without touching the route.
CREATE OR REPLACE FUNCTION public.admin_set_visit_pro(_visit_id uuid, _applicant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _applicant_id IS NOT NULL THEN
    SELECT a.contractor_id INTO v_uid FROM public.applicants a WHERE a.id = _applicant_id;
  END IF;
  UPDATE public.visits SET assigned_pro_id = v_uid WHERE id = _visit_id;
END;
$$;

-- Admin: upcoming visits with nobody on them.
CREATE OR REPLACE FUNCTION public.admin_unassigned_visits()
RETURNS TABLE(
  id uuid, subscription_id uuid, scheduled_start timestamptz,
  service_type text, street text, zip text, customer_first_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT v.id, v.subscription_id, v.scheduled_start, v.service_type, v.street, v.zip, v.customer_first_name
  FROM public.visits v
  WHERE v.assigned_pro_id IS NULL
    AND v.completed_at IS NULL
    AND (v.scheduled_start IS NULL OR v.scheduled_start >= now() - interval '1 day')
  ORDER BY v.scheduled_start NULLS LAST
  LIMIT 200;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_customer_pro(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_visit_pro(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unassigned_visits() TO authenticated;