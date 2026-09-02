-- =========================================================================
-- A. Preferred Pro notifications  +  B. On-arrival add-on requests
-- Everything Supabase-native: tables, triggers, pg_net edge dispatch.
-- =========================================================================

-- ---------- shared edge dispatcher --------------------------------------
-- Base URL lives in app_settings (project-specific value, set via data insert)
-- so this DDL stays portable.
CREATE OR REPLACE FUNCTION public.call_edge_function(_fn text, _payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'vault'
AS $$
DECLARE
  v_key text;
  v_base text;
BEGIN
  SELECT value #>> '{}' INTO v_base FROM public.app_settings WHERE key = 'edge_functions_base_url';
  IF v_base IS NULL OR length(v_base) = 0 THEN
    RAISE WARNING '[call_edge_function] edge_functions_base_url not set; skipping %', _fn;
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RAISE WARNING '[call_edge_function] service_role_key missing; skipping %', _fn;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_base, '/') || '/' || _fn,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := coalesce(_payload, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[call_edge_function] % dispatch failed: %', _fn, sqlerrm;
END;
$$;

REVOKE ALL ON FUNCTION public.call_edge_function(text, jsonb) FROM PUBLIC;

-- ---------- A1: one-time-ever debounce ledger ---------------------------
CREATE TABLE IF NOT EXISTS public.notified_pro_preference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  pro_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  service text,
  notified_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, pro_id)
);

GRANT SELECT ON public.notified_pro_preference TO authenticated;
GRANT ALL ON public.notified_pro_preference TO service_role;
ALTER TABLE public.notified_pro_preference ENABLE ROW LEVEL SECURITY;
CREATE POLICY "npp_admin_read" ON public.notified_pro_preference
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- A4: switch-away trend log (admin only, nobody notified) -----
CREATE TABLE IF NOT EXISTS public.preferred_pro_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  subscription_id uuid,
  from_pro_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  to_pro_id uuid REFERENCES public.applicants(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ppc_changed_at ON public.preferred_pro_changes (changed_at DESC);

GRANT SELECT ON public.preferred_pro_changes TO authenticated;
GRANT ALL ON public.preferred_pro_changes TO service_role;
ALTER TABLE public.preferred_pro_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppc_admin_read" ON public.preferred_pro_changes
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- in-app notification feed for Pros ---------------------------
CREATE TABLE IF NOT EXISTS public.pro_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  url text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pro_notifications_contractor
  ON public.pro_notifications (contractor_id, created_at DESC);

GRANT SELECT, UPDATE ON public.pro_notifications TO authenticated;
GRANT ALL ON public.pro_notifications TO service_role;
ALTER TABLE public.pro_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pro_notif_own_read" ON public.pro_notifications
  FOR SELECT TO authenticated
  USING (contractor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "pro_notif_own_mark_read" ON public.pro_notifications
  FOR UPDATE TO authenticated
  USING (contractor_id = auth.uid())
  WITH CHECK (contractor_id = auth.uid());

-- ---------- A5: high-demand threshold crossings -------------------------
CREATE TABLE IF NOT EXISTS public.pro_demand_crossings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  period text NOT NULL,
  preferred_by_count integer NOT NULL DEFAULT 0,
  booked_pct numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (applicant_id, period)
);

GRANT SELECT ON public.pro_demand_crossings TO authenticated;
GRANT ALL ON public.pro_demand_crossings TO service_role;
ALTER TABLE public.pro_demand_crossings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pdc_admin_read" ON public.pro_demand_crossings
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------- B2: add-on requests -----------------------------------------
CREATE TABLE IF NOT EXISTS public.addon_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL,
  pro_visit_id uuid REFERENCES public.pro_visits(id) ON DELETE SET NULL,
  pro_id uuid NOT NULL,
  customer_id uuid,
  addon_id uuid REFERENCES public.addon_catalog(id) ON DELETE SET NULL,
  addon_key text,
  addon_name text NOT NULL,
  condition_note text,
  photo_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','declined','expired','needs_quote')),
  amount_cents integer NOT NULL DEFAULT 0,
  pro_pay_cents integer,
  minutes_estimate integer NOT NULL DEFAULT 20,
  token text NOT NULL UNIQUE
    DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  stripe_payment_intent_id text,
  stripe_invoice_item_id text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_addon_requests_job ON public.addon_requests (job_id);
CREATE INDEX IF NOT EXISTS idx_addon_requests_pro ON public.addon_requests (pro_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_addon_requests_pending
  ON public.addon_requests (expires_at) WHERE status = 'pending';

GRANT SELECT ON public.addon_requests TO authenticated;
GRANT ALL ON public.addon_requests TO service_role;
ALTER TABLE public.addon_requests ENABLE ROW LEVEL SECURITY;
-- Pros read their own, customers read their own, admins read everything.
-- All writes go through service-role edge functions (price is server-owned).
CREATE POLICY "addon_requests_read_own" ON public.addon_requests
  FOR SELECT TO authenticated
  USING (
    pro_id = auth.uid()
    OR customer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- ---------- B1/B4/B5: job-level state ----------------------------------
ALTER TABLE public.pro_visits
  ADD COLUMN IF NOT EXISTS before_photos_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS before_photos_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS condition_flagged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS condition_photo_url text,
  ADD COLUMN IF NOT EXISTS condition_note text,
  ADD COLUMN IF NOT EXISTS addon_pay_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS declined_addon_name text;

ALTER TABLE public.visit_ratings
  ADD COLUMN IF NOT EXISTS excluded_from_average boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_review_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_review_notes text;

-- B5 — a low rating on a job the Pro correctly flagged is quarantined until
-- an admin looks at it. It never silently drags the Pro's average down.
CREATE OR REPLACE FUNCTION public.quarantine_flagged_low_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stars integer;
  v_flagged boolean;
BEGIN
  v_stars := COALESCE(NEW.stars, NEW.rating);
  IF v_stars IS NULL OR v_stars > 3 THEN
    RETURN NEW;
  END IF;

  SELECT pv.condition_flagged INTO v_flagged
  FROM public.pro_visits pv
  WHERE (NEW.pro_visit_id IS NOT NULL AND pv.id = NEW.pro_visit_id)
     OR (NEW.pro_visit_id IS NULL AND NEW.job_id IS NOT NULL AND pv.jobber_visit_id = NEW.job_id)
  LIMIT 1;

  IF COALESCE(v_flagged, false) THEN
    NEW.excluded_from_average := true;
    NEW.admin_review_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quarantine_flagged_low_rating ON public.visit_ratings;
CREATE TRIGGER trg_quarantine_flagged_low_rating
  BEFORE INSERT ON public.visit_ratings
  FOR EACH ROW EXECUTE FUNCTION public.quarantine_flagged_low_rating();

-- ---------- A1 + A4 trigger: preferred_pro_id changes -------------------
CREATE OR REPLACE FUNCTION public.on_preferred_pro_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.preferred_pro_id IS NOT DISTINCT FROM OLD.preferred_pro_id THEN
    RETURN NEW;
  END IF;

  -- A4: always recorded, nobody is ever notified about a switch away.
  INSERT INTO public.preferred_pro_changes (customer_id, subscription_id, from_pro_id, to_pro_id)
  VALUES (NEW.user_id, NEW.id, OLD.preferred_pro_id, NEW.preferred_pro_id);

  -- A1: only a newly named Pro gets told, and only the first time ever.
  IF NEW.preferred_pro_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.notified_pro_preference
       WHERE customer_id = NEW.user_id AND pro_id = NEW.preferred_pro_id
     ) THEN
    PERFORM public.call_edge_function('notify-preferred-pro', jsonb_build_object(
      'subscription_id', NEW.id,
      'customer_id', NEW.user_id,
      'pro_id', NEW.preferred_pro_id
    ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_preferred_pro_changed ON public.subscriptions;
CREATE TRIGGER trg_on_preferred_pro_changed
  AFTER UPDATE OF preferred_pro_id ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.on_preferred_pro_changed();

-- ---------- A3 trigger: in-app reassignment away from a booked Pro ------
CREATE OR REPLACE FUNCTION public.on_pro_visit_reassigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.contractor_id IS NOT DISTINCT FROM OLD.contractor_id
     OR OLD.contractor_id IS NULL
     OR NEW.contractor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status, 'scheduled') NOT IN ('scheduled', 'on_the_way') THEN
    RETURN NEW;
  END IF;

  PERFORM public.call_edge_function('notify-pro-substitution', jsonb_build_object(
    'pro_visit_id', NEW.id,
    'jobber_visit_id', NEW.jobber_visit_id,
    'old_contractor_id', OLD.contractor_id,
    'new_contractor_id', NEW.contractor_id,
    'scheduled_at', NEW.scheduled_at
  ));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_pro_visit_reassigned ON public.pro_visits;
CREATE TRIGGER trg_on_pro_visit_reassigned
  AFTER UPDATE OF contractor_id ON public.pro_visits
  FOR EACH ROW EXECUTE FUNCTION public.on_pro_visit_reassigned();

-- ---------- B6: abuse guardrail metrics --------------------------------
CREATE OR REPLACE FUNCTION public.get_pro_addon_request_stats()
RETURNS TABLE(
  applicant_id uuid,
  contractor_id uuid,
  requests integer,
  approvals integer,
  completed_visits integer,
  request_rate numeric,
  approval_rate numeric,
  fleet_median_rate numeric,
  over_3x_median boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_median numeric;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _pro_addon_stats ON COMMIT DROP AS SELECT 1;
  DROP TABLE IF EXISTS _pro_addon_stats;

  CREATE TEMP TABLE _pro_addon_stats ON COMMIT DROP AS
  SELECT
    a.id AS applicant_id,
    a.contractor_id,
    COALESCE(r.requests, 0)::integer AS requests,
    COALESCE(r.approvals, 0)::integer AS approvals,
    GREATEST(COALESCE(a.completed_visits, 0), 0)::integer AS completed_visits,
    ROUND(COALESCE(r.requests, 0)::numeric / GREATEST(COALESCE(a.completed_visits, 0), 1), 3) AS request_rate,
    CASE WHEN COALESCE(r.requests, 0) = 0 THEN NULL
         ELSE ROUND(COALESCE(r.approvals, 0)::numeric / r.requests, 3) END AS approval_rate
  FROM public.applicants a
  LEFT JOIN (
    SELECT pro_id,
           COUNT(*)::int AS requests,
           COUNT(*) FILTER (WHERE status = 'approved')::int AS approvals
    FROM public.addon_requests
    GROUP BY pro_id
  ) r ON r.pro_id = a.contractor_id
  WHERE a.contractor_id IS NOT NULL;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY s.request_rate)
    INTO v_median
  FROM _pro_addon_stats s
  WHERE s.completed_visits > 0;

  RETURN QUERY
  SELECT s.applicant_id, s.contractor_id, s.requests, s.approvals, s.completed_visits,
         s.request_rate, s.approval_rate,
         v_median AS fleet_median_rate,
         (v_median IS NOT NULL AND v_median > 0 AND s.request_rate > 3 * v_median) AS over_3x_median
  FROM _pro_addon_stats s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pro_addon_request_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pro_addon_request_stats() TO service_role;
