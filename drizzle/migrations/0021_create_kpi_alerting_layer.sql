CREATE TABLE public.kpi_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_month int NOT NULL,
  month_label text NOT NULL,
  hangers_planned int NOT NULL DEFAULT 0,
  marketing_spend_planned numeric NOT NULL DEFAULT 0,
  pros_required int NOT NULL DEFAULT 0,
  subs_planned int NOT NULL DEFAULT 0,
  gp_planned numeric NOT NULL DEFAULT 0,
  cum_profit_planned numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kpi_plan_plan_month_key ON public.kpi_plan (plan_month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_plan TO authenticated;
GRANT ALL ON public.kpi_plan TO service_role;
ALTER TABLE public.kpi_plan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage kpi_plan" ON public.kpi_plan FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.kpi_constant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rev_sub numeric NOT NULL DEFAULT 242,
  pay_sub numeric NOT NULL DEFAULT 109,
  gp_sub numeric NOT NULL DEFAULT 125.68,
  churn_target numeric NOT NULL DEFAULT 0.04,
  subs_per_pro int NOT NULL DEFAULT 65,
  max_hires_mo int NOT NULL DEFAULT 3,
  cost_per_hanger numeric NOT NULL DEFAULT 0.17,
  cust_per_5k numeric NOT NULL DEFAULT 26,
  hire_lead_days_house int NOT NULL DEFAULT 21,
  hire_lead_days_detail int NOT NULL DEFAULT 35,
  hire_buffer_days int NOT NULL DEFAULT 14,
  overhead_mo numeric NOT NULL DEFAULT 900,
  target_y1_profit numeric NOT NULL DEFAULT 150000,
  doors_33156 int NOT NULL DEFAULT 8420,
  doors_33183 int NOT NULL DEFAULT 8337,
  doors_33186 int NOT NULL DEFAULT 16356,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_constant TO authenticated;
GRANT ALL ON public.kpi_constant TO service_role;
ALTER TABLE public.kpi_constant ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage kpi_constant" ON public.kpi_constant FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.qr_scan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  zip text,
  campaign text,
  variant text,
  placement text,
  user_agent text,
  session_id text,
  converted_quote boolean NOT NULL DEFAULT false,
  converted_paid boolean NOT NULL DEFAULT false,
  customer_id uuid
);
CREATE INDEX qr_scan_zip_scanned_at_idx ON public.qr_scan (zip, scanned_at);
CREATE INDEX qr_scan_campaign_scanned_at_idx ON public.qr_scan (campaign, scanned_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_scan TO authenticated;
GRANT ALL ON public.qr_scan TO service_role;
ALTER TABLE public.qr_scan ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage qr_scan" ON public.qr_scan FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.hanger_drop (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dropped_on date NOT NULL DEFAULT current_date,
  zip text,
  quantity int NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  distributor text,
  verified_spotcheck boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hanger_drop_zip_dropped_on_idx ON public.hanger_drop (zip, dropped_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hanger_drop TO authenticated;
GRANT ALL ON public.hanger_drop TO service_role;
ALTER TABLE public.hanger_drop ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage hanger_drop" ON public.hanger_drop FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.kpi_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at timestamptz NOT NULL DEFAULT now(),
  "window" text CHECK ("window" IN ('am','pm')),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_by text NOT NULL DEFAULT 'kpi-rollup'
);
CREATE INDEX kpi_snapshot_captured_at_idx ON public.kpi_snapshot (captured_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_snapshot TO authenticated;
GRANT ALL ON public.kpi_snapshot TO service_role;
ALTER TABLE public.kpi_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage kpi_snapshot" ON public.kpi_snapshot FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.alert_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  domain text CHECK (domain IN ('capacity','profit','funnel','trust','plumbing')),
  priority int NOT NULL DEFAULT 2,
  title text,
  condition_note text,
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_window_days int NOT NULL DEFAULT 0,
  min_sample int NOT NULL DEFAULT 0,
  cooldown_hours int NOT NULL DEFAULT 72,
  severity text CHECK (severity IN ('red','amber','info')),
  digest text CHECK (digest IN ('am','pm','both')),
  enabled boolean NOT NULL DEFAULT true,
  action_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_rule TO authenticated;
GRANT ALL ON public.alert_rule TO service_role;
ALTER TABLE public.alert_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage alert_rule" ON public.alert_rule FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER alert_rule_updated_at BEFORE UPDATE ON public.alert_rule
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.alert_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  fired_at timestamptz NOT NULL DEFAULT now(),
  severity text,
  digest text,
  headline text,
  detail text,
  metric_value numeric,
  threshold_value numeric,
  suppressed_in_digest boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
CREATE INDEX alert_event_rule_code_fired_at_idx ON public.alert_event (rule_code, fired_at DESC);
CREATE INDEX alert_event_status_fired_at_idx ON public.alert_event (status, fired_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_event TO authenticated;
GRANT ALL ON public.alert_event TO service_role;
ALTER TABLE public.alert_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage alert_event" ON public.alert_event FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));