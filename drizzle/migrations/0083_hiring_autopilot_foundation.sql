-- Hiring & launch autopilot: data model foundation.
-- Additive only. Extends applicants + admin_alerts, adds four new tables.

-- ---------------------------------------------------------------- applicants
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS applied_on DATE,
  ADD COLUMN IF NOT EXISTS city_or_zip TEXT,
  ADD COLUMN IF NOT EXISTS drive_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS years_in_service NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_operator BOOLEAN,
  ADD COLUMN IF NOT EXISTS has_insurance BOOLEAN,
  ADD COLUMN IF NOT EXISTS trade_job_current BOOLEAN,
  ADD COLUMN IF NOT EXISTS experience_matches_resume TEXT,
  ADD COLUMN IF NOT EXISTS drivers_license TEXT,
  ADD COLUMN IF NOT EXISTS work_authorized TEXT,
  ADD COLUMN IF NOT EXISTS own_equipment TEXT,
  ADD COLUMN IF NOT EXISTS background_check_ok TEXT,
  ADD COLUMN IF NOT EXISTS reads_texts TEXT,
  ADD COLUMN IF NOT EXISTS bilingual_gate TEXT,
  ADD COLUMN IF NOT EXISTS tier_hint TEXT,
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS why TEXT,
  ADD COLUMN IF NOT EXISTS watch_for TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS queue_state TEXT NOT NULL DEFAULT 'not_contacted',
  ADD COLUMN IF NOT EXISTS first_texted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followed_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opening_id UUID,
  ADD COLUMN IF NOT EXISTS is_test_row BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.applicants.bilingual_gate IS
  'Tri-state yes/no/unknown hiring gate. The older boolean column "bilingual" stays for legacy readers.';

CREATE INDEX IF NOT EXISTS applicants_queue_state_idx
  ON public.applicants (service, queue_state, score DESC);

-- ------------------------------------------------------------ hiring_openings
CREATE TABLE IF NOT EXISTS public.hiring_openings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL CHECK (service IN ('cleaning','lawn','car_care','ops_coordinator')),
  slot_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'not_needed_yet'
    CHECK (status IN ('not_needed_yet','post_soon','post_today','posted','interviewing','filled','cancelled')),
  trigger_reason TEXT,
  forecast_trigger_date DATE,
  post_by_date DATE,
  posted_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  filled_by_applicant_id UUID REFERENCES public.applicants(id) ON DELETE SET NULL,
  indeed_sponsorship_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hiring_openings TO authenticated;
GRANT ALL ON public.hiring_openings TO service_role;
ALTER TABLE public.hiring_openings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hiring_openings admin all"
  ON public.hiring_openings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- -------------------------------------------------------------- service_gates
CREATE TABLE IF NOT EXISTS public.service_gates (
  service TEXT PRIMARY KEY CHECK (service IN ('cleaning','lawn','car_care')),
  is_live BOOLEAN NOT NULL DEFAULT false,
  auto_mode BOOLEAN NOT NULL DEFAULT true,
  business_policy_required BOOLEAN NOT NULL DEFAULT false,
  business_policy_bound BOOLEAN NOT NULL DEFAULT false,
  business_policy_doc_url TEXT,
  business_policy_effective DATE,
  business_policy_expires DATE,
  go_live_scheduled_for TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_change_reason TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_gates TO authenticated;
GRANT SELECT ON public.service_gates TO anon;
GRANT ALL ON public.service_gates TO service_role;
ALTER TABLE public.service_gates ENABLE ROW LEVEL SECURITY;

-- The public site reads is_live to decide pricing vs. "Opening soon".
CREATE POLICY "service_gates public read"
  ON public.service_gates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "service_gates admin write"
  ON public.service_gates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.service_gates (service, business_policy_required, last_change_reason)
VALUES ('cleaning', false, 'seeded'),
       ('lawn',     false, 'seeded'),
       ('car_care', true,  'seeded')
ON CONFLICT (service) DO NOTHING;

-- -------------------------------------------------------------- admin_alerts +
ALTER TABLE public.admin_alerts
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'warning'
    CHECK (level IN ('action','warning','critical')),
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS action_label TEXT,
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS admin_alerts_dedupe_key_uidx
  ON public.admin_alerts (dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ------------------------------------------------------------- calendar_tasks
CREATE TABLE IF NOT EXISTS public.calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offset_days_from_launch INTEGER,
  fixed_rule TEXT,
  title TEXT NOT NULL,
  body TEXT,
  heads_up_days INTEGER NOT NULL DEFAULT 7,
  next_due_date DATE,
  done_at TIMESTAMPTZ,
  recurring BOOLEAN NOT NULL DEFAULT false,
  sort_key INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_tasks TO authenticated;
GRANT ALL ON public.calendar_tasks TO service_role;
ALTER TABLE public.calendar_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_tasks admin all"
  ON public.calendar_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------- job_listing_templates
CREATE TABLE IF NOT EXISTS public.job_listing_templates (
  service TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_listing_templates TO authenticated;
GRANT ALL ON public.job_listing_templates TO service_role;
ALTER TABLE public.job_listing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_listing_templates admin all"
  ON public.job_listing_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------- seed openings
INSERT INTO public.hiring_openings (service, slot_number, status, posted_at, trigger_reason)
SELECT s, 1, 'posted', now(), 'initial launch hire'
FROM (VALUES ('cleaning'),('lawn'),('car_care')) AS v(s)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hiring_openings h WHERE h.service = v.s AND h.slot_number = 1
);

-- ---------------------------------------------------------------- settings
INSERT INTO public.app_settings (key, value) VALUES
  ('launch_date', 'null'::jsonb),
  ('route_capacity', '{"cleaning":22,"lawn":52,"car_care":47}'::jsonb),
  ('hire_trigger_pct', '0.85'::jsonb),
  ('hiring_cycle_days', '26'::jsonb)
ON CONFLICT (key) DO NOTHING;
