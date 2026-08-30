-- 1. Founding-offer ZIP persisted on the subscription row (promise, not a coupon).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS founding_zip text;

-- 2. Pro service assignments. The first hire is CROSS-TRAINED, so a pro can hold
--    a row per service with a fractional share of their billable time.
CREATE TABLE IF NOT EXISTS public.pro_service_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES public.applicants(id) ON DELETE CASCADE,
  contractor_id uuid,
  pro_name text,
  service public.service_type NOT NULL,
  time_share numeric(4,3) NOT NULL DEFAULT 1.0 CHECK (time_share > 0 AND time_share <= 1),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pro_service_assignments_unique
  ON public.pro_service_assignments (applicant_id, service)
  WHERE applicant_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pro_service_assignments TO authenticated;
GRANT ALL ON public.pro_service_assignments TO service_role;

ALTER TABLE public.pro_service_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins manage pro service assignments" ON public.pro_service_assignments;
CREATE POLICY "admins manage pro service assignments"
  ON public.pro_service_assignments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS pro_service_assignments_updated_at ON public.pro_service_assignments;
CREATE TRIGGER pro_service_assignments_updated_at
  BEFORE UPDATE ON public.pro_service_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Capacity crossings. One row per crossing so the alert fires ONCE, not daily.
CREATE TABLE IF NOT EXISTS public.capacity_crossings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service public.service_type NOT NULL,
  level text NOT NULL CHECK (level IN ('amber','red')),
  fill_pct numeric,
  days_to_ceiling numeric,
  demand_hours numeric,
  capacity_hours numeric,
  active_customers integer,
  notified_at timestamptz,
  notify_channels text[] NOT NULL DEFAULT '{}',
  cleared_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS capacity_crossings_open_unique
  ON public.capacity_crossings (service, level)
  WHERE cleared_at IS NULL;

GRANT SELECT ON public.capacity_crossings TO authenticated;
GRANT ALL ON public.capacity_crossings TO service_role;

ALTER TABLE public.capacity_crossings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read capacity crossings" ON public.capacity_crossings;
CREATE POLICY "admins read capacity crossings"
  ON public.capacity_crossings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
