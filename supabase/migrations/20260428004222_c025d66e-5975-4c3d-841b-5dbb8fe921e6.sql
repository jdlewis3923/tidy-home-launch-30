
-- ─── notification preferences (per-admin) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  pwa_push_enabled boolean NOT NULL DEFAULT true,
  calendar_enabled boolean NOT NULL DEFAULT true,
  notes_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start smallint NOT NULL DEFAULT 21, -- 21:00 ET
  quiet_hours_end smallint NOT NULL DEFAULT 7,    -- 07:00 ET
  snoozed_until timestamptz,
  per_kpi_sensitivity jsonb NOT NULL DEFAULT '{}'::jsonb, -- { kpi_code: 'off'|'critical'|'warning'|'all' }
  vip_kpi_codes text[] NOT NULL DEFAULT ARRAY['failed_payments','ai_assistant_uptime','edge_errors']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif_prefs select own admin"
  ON public.notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "notif_prefs insert own admin"
  ON public.notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "notif_prefs update own admin"
  ON public.notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── push subscriptions (web push API) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs select own admin"
  ON public.push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "push_subs insert own admin"
  ON public.push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "push_subs delete own admin"
  ON public.push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND has_role(auth.uid(), 'admin'::app_role));

-- ─── noise / suppression rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kpi_noise_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL UNIQUE,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  applies_to_kpis text[] NOT NULL DEFAULT '{}'::text[], -- empty = all
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kpi_noise_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "noise_rules admin all"
  ON public.kpi_noise_rules FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER noise_rules_updated_at
  BEFORE UPDATE ON public.kpi_noise_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rules
INSERT INTO public.kpi_noise_rules (rule_key, description, config, applies_to_kpis) VALUES
  ('weekend_signups', 'Suppress signup/spend dips on weekends (scheduler is weekday-only)',
   '{"days":[0,6]}'::jsonb,
   ARRAY['daily_signups','signup_conversion','ads_spend_daily']),
  ('billing_cycle_mrr', 'Suppress MRR red on days 1-3 of month (Stripe billing cycle)',
   '{"days_of_month":[1,2,3]}'::jsonb,
   ARRAY['mrr','active_subs']),
  ('stripe_retry_day', 'Suppress failed_payments spike on Stripe retry day (4 days after failure)',
   '{"window_hours":6}'::jsonb,
   ARRAY['failed_payments']),
  ('quiet_hours_uptime', 'Suppress ai_assistant_uptime red 21:00-09:00 ET',
   '{"start_hour_et":21,"end_hour_et":9}'::jsonb,
   ARRAY['ai_assistant_uptime']),
  ('dedup_24h', 'Suppress duplicate alert for same KPI within 24 hours',
   '{"window_hours":24}'::jsonb,
   ARRAY[]::text[]),
  ('recovery_in_progress', 'Suppress alert if recovery action ran in last 4h and KPI trending up',
   '{"window_hours":4}'::jsonb,
   ARRAY[]::text[]),
  ('info_only_playbook', 'Suppress alerts where every playbook step is INFO type',
   '{}'::jsonb,
   ARRAY[]::text[])
ON CONFLICT (rule_key) DO NOTHING;

-- ─── extend kpi_alerts with prediction + suppression metadata ───────────
ALTER TABLE public.kpi_alerts
  ADD COLUMN IF NOT EXISTS prediction_tier text, -- 'red' | 'orange' | 'yellow'
  ADD COLUMN IF NOT EXISTS hours_to_deadline numeric,
  ADD COLUMN IF NOT EXISTS estimated_impact_cents integer,
  ADD COLUMN IF NOT EXISTS top_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suppression_reason text,
  ADD COLUMN IF NOT EXISTS dedup_hash text,
  ADD COLUMN IF NOT EXISTS calendar_event_id text;

CREATE INDEX IF NOT EXISTS idx_kpi_alerts_dedup ON public.kpi_alerts(kpi_code, dedup_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_alerts_unresolved ON public.kpi_alerts(kpi_code) WHERE resolved_at IS NULL;

-- ─── seed VIP override list into app_settings (mirrors notif default) ──
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('vip_kpi_codes', '["failed_payments","ai_assistant_uptime","edge_errors"]'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
