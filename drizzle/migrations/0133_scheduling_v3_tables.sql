CREATE TABLE public.sched_config (key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.service_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service public.service_type NOT NULL,
  zip text NOT NULL CHECK (zip ~ '^[0-9]{5}$'),
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  active boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_effective date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service, zip, weekday)
);
CREATE TABLE public.pro_day_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL,
  service public.service_type NOT NULL,
  zip text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','dropping','ended')),
  drop_effective date,
  drop_reason text,
  pending_start time,
  pending_end time,
  hours_effective date,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  ended_at timestamptz,
  CHECK (start_time >= time '08:00' AND end_time <= time '18:00' AND end_time - start_time >= interval '4 hours'),
  CHECK (pending_start IS NULL OR (pending_start >= time '08:00' AND pending_end <= time '18:00' AND pending_end - pending_start >= interval '4 hours'))
);
CREATE UNIQUE INDEX pro_day_claims_one_pro_per_day ON public.pro_day_claims (service, zip, weekday) WHERE status <> 'ended';
CREATE INDEX pro_day_claims_pro ON public.pro_day_claims (pro_user_id);
CREATE TABLE public.pro_catchup_days (pro_user_id uuid PRIMARY KEY, weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.pro_date_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL,
  off_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('call_off','time_off')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pro_user_id, off_date)
);
CREATE TABLE public.sched_blackouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  off_date date NOT NULL,
  service public.service_type,
  zip text,
  kind text NOT NULL CHECK (kind IN ('holiday','weather')),
  label text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (off_date, service, zip, kind)
);
CREATE TABLE public.customer_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  service public.service_type NOT NULL,
  zip text NOT NULL,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 6),
  window_key text NOT NULL CHECK (window_key IN ('day','morning','midday','afternoon')),
  cadence text NOT NULL,
  budget_hours numeric NOT NULL CHECK (budget_hours > 0),
  first_visit_date date NOT NULL,
  claim_id uuid NOT NULL REFERENCES public.pro_day_claims(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX customer_bookings_one_active ON public.customer_bookings (subscription_id, service) WHERE status = 'active';
CREATE INDEX customer_bookings_claim ON public.customer_bookings (claim_id) WHERE status = 'active';
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS booking_id uuid, ADD COLUMN IF NOT EXISTS claim_id uuid,
  ADD COLUMN IF NOT EXISTS budget_hours numeric, ADD COLUMN IF NOT EXISTS window_key text,
  ADD COLUMN IF NOT EXISTS moved_from_date date, ADD COLUMN IF NOT EXISTS anchor_date date;
CREATE INDEX IF NOT EXISTS visits_pro_date ON public.visits (assigned_pro_id, visit_date);
CREATE INDEX IF NOT EXISTS visits_booking_anchor ON public.visits (booking_id, anchor_date);
CREATE TABLE public.visit_moves (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), visit_id uuid NOT NULL, from_date date, to_date date, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.reschedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid, booking_id uuid, claim_id uuid,
  kind text NOT NULL CHECK (kind IN ('unplaceable','day_loss','inactive_pro','hours_shortened')),
  reason text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz, resolved_by uuid, resolution_note text
);
CREATE TABLE public.capacity_overrides (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), visit_id uuid NOT NULL, reason text NOT NULL CHECK (length(btrim(reason)) >= 3), admin_id uuid NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.sched_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  service public.service_type NOT NULL,
  zip text NOT NULL,
  weekday smallint CHECK (weekday BETWEEN 1 AND 6),
  kind text NOT NULL CHECK (kind IN ('zip','day')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','booked','expired','canceled')),
  offer_weekday smallint, offered_at timestamptz, hold_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sched_waitlist_one_open ON public.sched_waitlist (user_id, service, coalesce(weekday,0)) WHERE status IN ('waiting','offered');
CREATE TABLE public.sched_budget_hours (service public.service_type NOT NULL, visit_kind text NOT NULL, size_tier smallint NOT NULL DEFAULT 0, hours numeric NOT NULL CHECK (hours > 0), PRIMARY KEY (service, visit_kind, size_tier));
CREATE TABLE public.sched_notice_log (key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.hire_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service public.service_type NOT NULL, zip text NOT NULL, weekday smallint NOT NULL,
  spec text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hire_specs_one_open ON public.hire_specs (service, zip, weekday) WHERE status = 'open';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sched_config, public.service_days, public.pro_day_claims, public.pro_catchup_days,
  public.pro_date_exceptions, public.sched_blackouts, public.customer_bookings, public.visit_moves, public.reschedule_items,
  public.capacity_overrides, public.sched_waitlist, public.sched_budget_hours, public.sched_notice_log, public.hire_specs TO authenticated;
GRANT ALL ON public.sched_config, public.service_days, public.pro_day_claims, public.pro_catchup_days,
  public.pro_date_exceptions, public.sched_blackouts, public.customer_bookings, public.visit_moves, public.reschedule_items,
  public.capacity_overrides, public.sched_waitlist, public.sched_budget_hours, public.sched_notice_log, public.hire_specs TO service_role;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['sched_config','service_days','pro_day_claims','pro_catchup_days','pro_date_exceptions','sched_blackouts','customer_bookings','visit_moves','reschedule_items','capacity_overrides','sched_waitlist','sched_budget_hours','sched_notice_log','hire_specs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s admin all" ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
  END LOOP;
END $$;
CREATE POLICY "service_days signed-in read" ON public.service_days FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "sched_config signed-in read" ON public.sched_config FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "sched_blackouts signed-in read" ON public.sched_blackouts FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "pro_day_claims own read" ON public.pro_day_claims FOR SELECT TO authenticated USING (pro_user_id = auth.uid());
CREATE POLICY "pro_catchup own read" ON public.pro_catchup_days FOR SELECT TO authenticated USING (pro_user_id = auth.uid());
CREATE POLICY "pro_date_exceptions own read" ON public.pro_date_exceptions FOR SELECT TO authenticated USING (pro_user_id = auth.uid());
CREATE POLICY "customer_bookings own read" ON public.customer_bookings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "sched_waitlist own read" ON public.sched_waitlist FOR SELECT TO authenticated USING (user_id = auth.uid());