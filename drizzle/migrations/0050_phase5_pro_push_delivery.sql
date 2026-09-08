-- Phase 5 — contractor push notifications, actually switched on.
--
-- 1) pro_push_outbox: non-urgent pushes are HELD until the courtesy window
--    (08:00-18:00 ET, Mon-Sat) rather than waking a contractor at 3am. Urgent
--    pushes never touch this table.
-- 2) admin_pro_push_status(): who is actually reachable, for the admin view.

CREATE TABLE IF NOT EXISTS public.pro_push_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  url TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL UNIQUE,
  queued_reason TEXT NOT NULL DEFAULT 'quiet_hours',
  release_after TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.pro_push_outbox TO service_role;
GRANT SELECT ON public.pro_push_outbox TO authenticated;

ALTER TABLE public.pro_push_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read pro push outbox" ON public.pro_push_outbox;
CREATE POLICY "admins read pro push outbox"
ON public.pro_push_outbox
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS pro_push_outbox_due_idx
  ON public.pro_push_outbox (status, release_after);

-- Per-pro reachability: devices registered, last device activity, and whether
-- an SMS fallback number exists at all.
CREATE OR REPLACE FUNCTION public.admin_pro_push_status()
RETURNS TABLE(
  applicant_id UUID,
  contractor_id UUID,
  first_name TEXT,
  last_name TEXT,
  badge_status TEXT,
  devices INTEGER,
  last_push_device_at TIMESTAMPTZ,
  has_fallback_phone BOOLEAN,
  reachable BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.contractor_id,
    a.first_name,
    a.last_name,
    a.badge_status,
    COALESCE(s.devices, 0)::int,
    s.last_used_at,
    btrim(COALESCE(a.phone, '')) <> '',
    COALESCE(s.devices, 0) > 0
  FROM public.applicants a
  LEFT JOIN (
    SELECT user_id, COUNT(*) AS devices, MAX(last_used_at) AS last_used_at
    FROM public.push_subscriptions
    GROUP BY user_id
  ) s ON s.user_id = a.contractor_id
  WHERE a.contractor_id IS NOT NULL
    AND public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY COALESCE(s.devices, 0) DESC, a.first_name;
$$;

REVOKE ALL ON FUNCTION public.admin_pro_push_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_pro_push_status() TO authenticated;