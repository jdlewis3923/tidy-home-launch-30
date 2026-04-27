-- ============ ENUMS ============
CREATE TYPE public.kpi_category AS ENUM (
  'acquisition','conversion','operations','customer_health','reviews','financial','system_health'
);

CREATE TYPE public.kpi_frequency AS ENUM (
  'realtime','hourly','daily','weekly','biweekly','monthly'
);

CREATE TYPE public.kpi_status AS ENUM ('green','warn','critical','unknown');

CREATE TYPE public.kpi_action_type AS ENUM ('AUTO','MANUAL','INFO');

CREATE TYPE public.kpi_alert_severity AS ENUM ('warn','critical');

-- ============ kpi_definitions ============
CREATE TABLE public.kpi_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category public.kpi_category NOT NULL,
  frequency public.kpi_frequency NOT NULL,
  unit text,                         -- e.g. '$', '%', 'count'
  target_value numeric,              -- nullable when target is descriptive
  target_label text,                 -- human-readable target (handles ranges/ramps)
  warn_threshold numeric,
  warn_label text,
  critical_threshold numeric,
  critical_label text,
  direction text NOT NULL DEFAULT 'higher_is_better', -- higher_is_better | lower_is_better | range
  playbook jsonb NOT NULL DEFAULT '[]'::jsonb,        -- [{step, action_type, action_key?}]
  source text,                                         -- 'supabase'|'ga4'|'google_ads'|'meta'|'jobber'|'stripe'|'twilio'|'brevo'|'manual'
  enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_def_category ON public.kpi_definitions(category, display_order);
CREATE INDEX idx_kpi_def_enabled ON public.kpi_definitions(enabled) WHERE enabled = true;

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_definitions admin all" ON public.kpi_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_kpi_definitions_updated_at
  BEFORE UPDATE ON public.kpi_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ kpi_snapshots ============
CREATE TABLE public.kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_code text NOT NULL REFERENCES public.kpi_definitions(code) ON DELETE CASCADE,
  value numeric,
  value_text text,                   -- when value isn't strictly numeric
  status public.kpi_status NOT NULL DEFAULT 'unknown',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,  -- breakdowns, prior period, channel splits
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_snap_code_time ON public.kpi_snapshots(kpi_code, computed_at DESC);
CREATE INDEX idx_kpi_snap_status ON public.kpi_snapshots(status, computed_at DESC);

ALTER TABLE public.kpi_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_snapshots admin select" ON public.kpi_snapshots
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- (No insert policy → service-role-only writes via edge functions)

-- ============ kpi_alerts ============
CREATE TABLE public.kpi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_code text NOT NULL REFERENCES public.kpi_definitions(code) ON DELETE CASCADE,
  severity public.kpi_alert_severity NOT NULL,
  value numeric,
  message text NOT NULL,
  channels_notified text[] NOT NULL DEFAULT '{}',   -- ['sms','email','dashboard']
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_alerts_open ON public.kpi_alerts(kpi_code, created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_kpi_alerts_severity ON public.kpi_alerts(severity, created_at DESC);

ALTER TABLE public.kpi_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_alerts admin select" ON public.kpi_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "kpi_alerts admin update" ON public.kpi_alerts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ kpi_targets (period-based overrides) ============
CREATE TABLE public.kpi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_code text NOT NULL REFERENCES public.kpi_definitions(code) ON DELETE CASCADE,
  period_label text NOT NULL,        -- 'week_2','week_6','day_90','always'
  effective_from date NOT NULL,
  effective_to date,
  target_value numeric,
  warn_threshold numeric,
  critical_threshold numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kpi_targets_code ON public.kpi_targets(kpi_code, effective_from DESC);

ALTER TABLE public.kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_targets admin all" ON public.kpi_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ kpi_action_log ============
CREATE TABLE public.kpi_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_code text NOT NULL REFERENCES public.kpi_definitions(code) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.kpi_alerts(id) ON DELETE SET NULL,
  action_type public.kpi_action_type NOT NULL,
  action_key text,                   -- handler key for AUTO actions
  action_label text NOT NULL,        -- the playbook step text
  triggered_by uuid,                 -- auth user id (Justin) or null for system
  status text NOT NULL DEFAULT 'pending', -- 'pending'|'success'|'error'|'noop'
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_kpi_action_log_code ON public.kpi_action_log(kpi_code, created_at DESC);
CREATE INDEX idx_kpi_action_log_status ON public.kpi_action_log(status, created_at DESC);

ALTER TABLE public.kpi_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_action_log admin select" ON public.kpi_action_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "kpi_action_log admin insert" ON public.kpi_action_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ SEED: 38 KPIs ============
INSERT INTO public.kpi_definitions
  (code, name, category, frequency, unit, target_value, target_label, warn_threshold, warn_label, critical_threshold, critical_label, direction, source, display_order, playbook)
VALUES
-- ACQUISITION (1-8)
('site_sessions','Site Sessions (GA4)','acquisition','hourly','sessions',100,'100/day',50,'<50',20,'<20','higher_is_better','ga4',1,
  '[{"step":"Check Google Ads budget pacing","action_type":"INFO","action_key":"info_ads_budget_pacing"},
    {"step":"Audit LP errors via System Health","action_type":"INFO","action_key":"info_system_health"},
    {"step":"Boost top campaign +20%","action_type":"AUTO","action_key":"auto_boost_top_campaign_20"},
    {"step":"Review GA4 sources for channel drop","action_type":"INFO","action_key":"info_ga4_sources"}]'::jsonb),

('ads_spend_daily','Google Ads Spend $/day','acquisition','daily','$',66,'$66/day',40,'<$40',0,'$0','range','google_ads',2,
  '[{"step":"Check Ads Manager disapprovals","action_type":"INFO","action_key":"info_ads_disapprovals"},
    {"step":"Verify billing card valid","action_type":"INFO","action_key":"info_ads_billing"},
    {"step":"Check campaigns not paused","action_type":"AUTO","action_key":"auto_check_campaigns_active"},
    {"step":"Verify daily budget set per campaign","action_type":"INFO","action_key":"info_ads_budgets"}]'::jsonb),

('ads_ctr','Google Ads CTR %','acquisition','daily','%',4,'4% brand / 2% category',1.5,'<1.5%',0.5,'<0.5%','higher_is_better','google_ads',3,
  '[{"step":"Pause lowest-CTR ad","action_type":"AUTO","action_key":"auto_pause_lowest_ctr_ad"},
    {"step":"A/B test new headline","action_type":"MANUAL"},
    {"step":"Tighten match types","action_type":"MANUAL"},
    {"step":"Add negatives from search terms","action_type":"AUTO","action_key":"auto_add_search_term_negatives"}]'::jsonb),

('cac','CAC by Channel $','acquisition','weekly','$',50,'$50',100,'>$100',150,'>$150','lower_is_better','google_ads',4,
  '[{"step":"Audit highest CAC channel","action_type":"INFO","action_key":"info_cac_breakdown"},
    {"step":"Reduce spend there","action_type":"MANUAL"},
    {"step":"Reallocate to best LTV/CAC","action_type":"MANUAL"},
    {"step":"Improve LP conversion","action_type":"MANUAL"}]'::jsonb),

('traffic_distribution','Top Source % of Traffic','acquisition','weekly','%',60,'≤60% from any one source',80,'>80%',95,'>95%','lower_is_better','ga4',5,
  '[{"step":"Add email newsletter cadence","action_type":"AUTO","action_key":"auto_schedule_newsletter"},
    {"step":"Push lower channels","action_type":"MANUAL"},
    {"step":"Build SEO content","action_type":"MANUAL"}]'::jsonb),

('ig_growth','IG Followers + Engagement','acquisition','daily','followers',5,'+5/wk · 5% eng',2,'+2/wk · 2% eng',0,'net loss','higher_is_better','meta',6,
  '[{"step":"Check last 5 posts pattern","action_type":"INFO","action_key":"info_ig_recent_posts"},
    {"step":"Adjust caption + post time","action_type":"MANUAL"},
    {"step":"Engage in #Pinecrest #Kendall","action_type":"MANUAL"},
    {"step":"Comment on local accounts daily","action_type":"MANUAL"}]'::jsonb),

('fb_growth','FB Likes + Reach','acquisition','daily','likes',3,'+3/wk · 500 reach',1,'+1/wk · 200 reach',0,'net loss','higher_is_better','meta',7,
  '[{"step":"Check last 5 posts pattern","action_type":"INFO","action_key":"info_fb_recent_posts"},
    {"step":"Adjust caption + post time","action_type":"MANUAL"},
    {"step":"Engage in local FB groups","action_type":"MANUAL"},
    {"step":"Comment on local pages daily","action_type":"MANUAL"}]'::jsonb),

('nextdoor','Nextdoor Reach + Recs','acquisition','weekly','recs',1,'1+/wk after wk4',0,'0 for 2wk',0,'0 for 4wk','higher_is_better','manual',8,
  '[{"step":"Day in the life post","action_type":"MANUAL"},
    {"step":"Ask 3 satisfied customers","action_type":"MANUAL"},
    {"step":"Run Local Deal","action_type":"MANUAL"},
    {"step":"Reply to comments <24h","action_type":"MANUAL"}]'::jsonb),

-- CONVERSION (9-14)
('daily_signups','Daily Signups','conversion','realtime','signups',1,'1+ wk1, ramp to 5 by d90',0,'0 for 2d',0,'0 for 5d','higher_is_better','supabase',9,
  '[{"step":"Check Google Ads CTR + spend","action_type":"INFO","action_key":"info_ads_ctr_spend"},
    {"step":"Site uptime check","action_type":"INFO","action_key":"info_uptime_check"},
    {"step":"Run flash discount push","action_type":"AUTO","action_key":"auto_flash_discount_push"},
    {"step":"Email past leads","action_type":"AUTO","action_key":"auto_email_past_leads"},
    {"step":"Boost referral push","action_type":"AUTO","action_key":"auto_referral_push"}]'::jsonb),

('signup_conversion','Signup→Sub Conversion %','conversion','daily','%',60,'60%',40,'<40%',20,'<20%','higher_is_better','supabase',10,
  '[{"step":"Check Stripe checkout errors","action_type":"INFO","action_key":"info_stripe_errors"},
    {"step":"Stripe API status check","action_type":"INFO","action_key":"info_stripe_status"},
    {"step":"A/B test pricing display","action_type":"MANUAL"},
    {"step":"Simplify form","action_type":"MANUAL"},
    {"step":"Add live chat","action_type":"MANUAL"},
    {"step":"Verify abandonment emails fire","action_type":"INFO","action_key":"info_abandonment_zaps"}]'::jsonb),

('plan_distribution','Bundle % of New Subs','conversion','weekly','%',30,'30%',15,'<15%',5,'<5%','higher_is_better','supabase',11,
  '[{"step":"Anchor pricing to bundle","action_type":"MANUAL"},
    {"step":"Show savings calculator","action_type":"MANUAL"},
    {"step":"Plan comparison table","action_type":"MANUAL"},
    {"step":"Bundle in email subjects","action_type":"AUTO","action_key":"auto_bundle_email_subject_test"}]'::jsonb),

('promo_redemption','TIDY50 Redemption %','conversion','daily','%',50,'50%',20,'<20%',5,'<5%','higher_is_better','stripe',12,
  '[{"step":"Verify TIDY50 banner on /signup + LPs","action_type":"INFO","action_key":"info_promo_banner_check"},
    {"step":"Email blast reminder","action_type":"AUTO","action_key":"auto_email_promo_reminder"},
    {"step":"Social post highlight","action_type":"MANUAL"},
    {"step":"Add to email signature","action_type":"MANUAL"}]'::jsonb),

('checkout_abandonment','Checkout Abandonment %','conversion','daily','%',30,'≤30%',50,'>50%',70,'>70%','lower_is_better','stripe',13,
  '[{"step":"Check Stripe checkout config","action_type":"INFO","action_key":"info_stripe_checkout_config"},
    {"step":"Verify retargeting Zaps fire","action_type":"INFO","action_key":"info_retargeting_zaps"},
    {"step":"Simplify fields","action_type":"MANUAL"},
    {"step":"Add urgency banner","action_type":"MANUAL"}]'::jsonb),

('funnel_drop','Per-Step Funnel Drop %','conversion','weekly','%',40,'≤40% per step',60,'>60%',80,'>80%','lower_is_better','ga4',14,
  '[{"step":"Heatmap worst step","action_type":"INFO","action_key":"info_funnel_heatmap"},
    {"step":"A/B test that step","action_type":"MANUAL"},
    {"step":"Reduce friction","action_type":"MANUAL"}]'::jsonb),

-- OPERATIONS (15-20)
('visits_today','Today''s Scheduled Visits','operations','realtime','visits',NULL,'matches subs cadence',1,'1 skip',3,'3+ skips','higher_is_better','jobber',15,
  '[{"step":"Reschedule via Jobber","action_type":"AUTO","action_key":"auto_jobber_reschedule"},
    {"step":"Email + SMS customer","action_type":"AUTO","action_key":"auto_visit_skip_notify"},
    {"step":"Escalate to Justin same-day","action_type":"AUTO","action_key":"auto_escalate_justin_sms"}]'::jsonb),

('visit_completion','Visit Completion %','operations','daily','%',95,'95%',90,'<90%',80,'<80%','higher_is_better','jobber',16,
  '[{"step":"Identify cause: no-show/cancel/crew","action_type":"INFO","action_key":"info_visit_failure_breakdown"},
    {"step":"Contact crew lead","action_type":"MANUAL"},
    {"step":"Adjust schedule + buffer","action_type":"MANUAL"},
    {"step":"Reach affected customer with credit","action_type":"AUTO","action_key":"auto_credit_affected_customers"}]'::jsonb),

('on_time_arrival','On-Time % within 30min','operations','daily','%',90,'90%',80,'<80%',70,'<70%','higher_is_better','jobber',17,
  '[{"step":"Re-optimize routes in Jobber","action_type":"MANUAL"},
    {"step":"Add buffer between visits","action_type":"MANUAL"},
    {"step":"Check Miami traffic by time-of-day","action_type":"INFO","action_key":"info_traffic_patterns"},
    {"step":"Brief crew on punctuality","action_type":"MANUAL"}]'::jsonb),

('crew_utilization','Crew Utilization %','operations','weekly','%',77,'70-85%',50,'<50% or >95%',30,'<30% or >100%','range','jobber',18,
  '[{"step":"If under: reduce roster or push sales","action_type":"MANUAL"},
    {"step":"If over: hire more crew or cap visits","action_type":"MANUAL"}]'::jsonb),

('customer_no_show','Customer No-Show Rate %','operations','weekly','%',3,'≤3%',7,'>7%',12,'>12%','lower_is_better','jobber',19,
  '[{"step":"Verify day-before reminder Zap fires","action_type":"INFO","action_key":"info_reminder_zap_check"},
    {"step":"Add day-of 30-min-out SMS","action_type":"AUTO","action_key":"auto_30min_out_sms"},
    {"step":"Require key/access plan in setup","action_type":"MANUAL"}]'::jsonb),

('same_day_reschedule','Same-Day Reschedule %','operations','weekly','%',5,'≤5%',10,'>10%',15,'>15%','lower_is_better','jobber',20,
  '[{"step":"Tighten reschedule cutoff to 24h","action_type":"MANUAL"},
    {"step":"Charge reschedule fee for <24h","action_type":"MANUAL"},
    {"step":"Better day-before reminder","action_type":"AUTO","action_key":"auto_improve_reminder"}]'::jsonb),

-- CUSTOMER HEALTH (21-25)
('active_subs','Active Subscribers','customer_health','realtime','subs',NULL,'5 wk2 / 20 wk6 / 60 d90',NULL,'-20% vs target',NULL,'-40% vs target','higher_is_better','supabase',21,
  '[{"step":"Increase Google Ads spend +20%","action_type":"AUTO","action_key":"auto_boost_ads_20"},
    {"step":"Run referral push email","action_type":"AUTO","action_key":"auto_referral_push"},
    {"step":"Email all past leads with promo","action_type":"AUTO","action_key":"auto_email_past_leads"},
    {"step":"Bundle upsell to single-service subs","action_type":"AUTO","action_key":"auto_bundle_upsell_email"}]'::jsonb),

('churn_rate','Monthly Churn %','customer_health','weekly','%',5,'≤5%',10,'>10%',15,'>15%','lower_is_better','stripe',22,
  '[{"step":"Run automated exit survey","action_type":"AUTO","action_key":"auto_exit_survey"},
    {"step":"Personal call from Justin to every churn","action_type":"MANUAL"},
    {"step":"Identify pattern","action_type":"INFO","action_key":"info_churn_pattern"},
    {"step":"Implement specific process fix","action_type":"MANUAL"}]'::jsonb),

('ltv','Customer LTV $','customer_health','monthly','$',1000,'$1000',500,'<$500',250,'<$250','higher_is_better','stripe',23,
  '[{"step":"Reduce churn (see churn_rate playbook)","action_type":"INFO","action_key":"info_see_churn"},
    {"step":"Upsell to bundle","action_type":"AUTO","action_key":"auto_bundle_upsell_email"},
    {"step":"Add quarterly add-ons","action_type":"MANUAL"}]'::jsonb),

('nps','NPS Score','customer_health','weekly','nps',50,'50+',30,'<30',0,'<0','higher_is_better','manual',24,
  '[{"step":"Identify each detractor by name","action_type":"INFO","action_key":"info_nps_detractors"},
    {"step":"Personal call from Justin <24h","action_type":"MANUAL"},
    {"step":"Fix specific complaint","action_type":"MANUAL"},
    {"step":"Process change to prevent","action_type":"MANUAL"}]'::jsonb),

('inbox_open','Inbox Open Count','customer_health','realtime','convos',5,'≤5 open',15,'>15',25,'>25 or oldest >4h','lower_is_better','supabase',25,
  '[{"step":"Triage urgent first","action_type":"INFO","action_key":"info_inbox_triage"},
    {"step":"Respond personally","action_type":"MANUAL"},
    {"step":"Escalate to AI Assistant for common Q","action_type":"AUTO","action_key":"auto_escalate_ai_assistant"},
    {"step":"Hire support hours if pattern","action_type":"MANUAL"}]'::jsonb),

-- REVIEWS (26-29)
('google_reviews_weekly','New Google Reviews/Week','reviews','weekly','reviews',2,'2/wk',0,'0 for 2wk',0,'0 for 4wk','higher_is_better','manual',26,
  '[{"step":"Push review request to recent satisfied (Zap 357817673)","action_type":"AUTO","action_key":"auto_review_request_push"},
    {"step":"Add review CTA to email signature","action_type":"MANUAL"},
    {"step":"Hand card at end of visit","action_type":"MANUAL"},
    {"step":"Monthly drawing for review","action_type":"MANUAL"}]'::jsonb),

('avg_star_rating','Average Star Rating','reviews','realtime','stars',4.7,'4.7+',4.5,'<4.5',4.5,'<4.5 or -0.2 in week','higher_is_better','manual',27,
  '[{"step":"Identify the bad review","action_type":"INFO","action_key":"info_bad_review_identify"},
    {"step":"Respond publicly with empathy","action_type":"MANUAL"},
    {"step":"Reach privately to fix","action_type":"MANUAL"},
    {"step":"Process change","action_type":"MANUAL"},
    {"step":"Push positive reviews to dilute","action_type":"AUTO","action_key":"auto_review_request_push"}]'::jsonb),

('rating_delta','Star Rating Delta','reviews','weekly','stars',0,'stable+',-0.1,'-0.1',-0.2,'-0.2','higher_is_better','manual',28,
  '[{"step":"Identify the bad review","action_type":"INFO","action_key":"info_bad_review_identify"},
    {"step":"Respond publicly with empathy","action_type":"MANUAL"},
    {"step":"Reach privately to fix","action_type":"MANUAL"},
    {"step":"Push positive reviews to dilute","action_type":"AUTO","action_key":"auto_review_request_push"}]'::jsonb),

('nextdoor_recs','Nextdoor Recommendations','reviews','weekly','recs',1,'1/wk after wk4',0,'0 for 2wk',0,'0 for 4wk','higher_is_better','manual',29,
  '[{"step":"Ask satisfied customers to recommend on ND","action_type":"MANUAL"},
    {"step":"Post helpful neighborhood content","action_type":"MANUAL"}]'::jsonb),

-- FINANCIAL (30-34)
('mrr','MRR $','financial','realtime','$',NULL,'$1k wk2 / $4k wk6 / $12k d90',NULL,'-20% vs target',NULL,'-50% vs target','higher_is_better','stripe',30,
  '[{"step":"Increase Google Ads spend","action_type":"AUTO","action_key":"auto_boost_ads_20"},
    {"step":"Run referral campaign","action_type":"AUTO","action_key":"auto_referral_push"},
    {"step":"Bundle upsell to single-service","action_type":"AUTO","action_key":"auto_bundle_upsell_email"},
    {"step":"Extend TIDY50 promo","action_type":"MANUAL"},
    {"step":"Add testimonials to LPs","action_type":"MANUAL"}]'::jsonb),

('failed_payments','Failed Payments $/count','financial','realtime','$',2,'<2% of billings',5,'5 events',10,'10 events','lower_is_better','stripe',31,
  '[{"step":"Verify Payment Failed Zaps fired (357804187, 357844052)","action_type":"INFO","action_key":"info_payment_failed_zaps"},
    {"step":"Send personal recovery email","action_type":"AUTO","action_key":"auto_payment_recovery_email"},
    {"step":"Call customer","action_type":"MANUAL"},
    {"step":"Pause sub if 3 retries fail","action_type":"AUTO","action_key":"auto_pause_failed_sub"}]'::jsonb),

('payment_recovery','Payment Recovery Rate %','financial','weekly','%',70,'70%',50,'<50%',30,'<30%','higher_is_better','stripe',32,
  '[{"step":"Improve recovery email sequence","action_type":"MANUAL"},
    {"step":"Personal call to non-recovered","action_type":"MANUAL"},
    {"step":"Extend Stripe retry window","action_type":"MANUAL"},
    {"step":"Offer alt payment method","action_type":"AUTO","action_key":"auto_offer_alt_payment"}]'::jsonb),

('coupon_spend','TIDY50 Spend % of MRR','financial','daily','%',25,'≤25%',30,'>30%',40,'>40%','lower_is_better','stripe',33,
  '[{"step":"Tighten to first month only (already)","action_type":"INFO","action_key":"info_promo_terms"},
    {"step":"Reduce $50→$25","action_type":"MANUAL"},
    {"step":"Reduce eligibility window","action_type":"MANUAL"}]'::jsonb),

('gross_margin','Gross Margin per Service %','financial','monthly','%',60,'60% cleaning / 65% lawn / 55% detail',40,'<40% any',25,'<25% any','higher_is_better','manual',34,
  '[{"step":"Audit crew costs per visit","action_type":"INFO","action_key":"info_crew_cost_audit"},
    {"step":"Adjust pricing","action_type":"MANUAL"},
    {"step":"Consolidate routes","action_type":"MANUAL"},
    {"step":"Renegotiate suppliers","action_type":"MANUAL"}]'::jsonb),

-- SYSTEM HEALTH (35-38)
('edge_errors','Edge Function Errors/hr','system_health','realtime','errors',5,'<5/hr',15,'>15/hr',30,'>30/hr','lower_is_better','supabase',35,
  '[{"step":"Check Lovable error logs","action_type":"INFO","action_key":"info_edge_logs"},
    {"step":"Identify failing function","action_type":"INFO","action_key":"info_failing_function"},
    {"step":"Roll back recent deploy","action_type":"MANUAL"},
    {"step":"Notify Lovable","action_type":"MANUAL"}]'::jsonb),

('webhook_delivery','Webhook Delivery %','system_health','hourly','%',99,'99%',95,'<95%',90,'<90% or unreachable >10min','higher_is_better','supabase',36,
  '[{"step":"Check Supabase function uptime","action_type":"INFO","action_key":"info_function_uptime"},
    {"step":"Check webhook signature validation","action_type":"INFO","action_key":"info_webhook_sigs"},
    {"step":"Verify Stripe/Jobber subscription registered","action_type":"INFO","action_key":"info_webhook_subs"},
    {"step":"Check secret rotation didn''t break auth","action_type":"INFO","action_key":"info_secret_rotation"}]'::jsonb),

('ai_assistant_uptime','AI Assistant Uptime %','system_health','realtime','%',99.9,'99.9% in business hours',99,'<99%',NULL,'any 5min outage 9a-9p','higher_is_better','twilio',37,
  '[{"step":"Check Twilio AI Assistant status","action_type":"INFO","action_key":"info_twilio_ai_status"},
    {"step":"Fall back to direct human SMS routing","action_type":"AUTO","action_key":"auto_sms_human_fallback"},
    {"step":"Notify Twilio support","action_type":"MANUAL"},
    {"step":"Notify customers of temp delay","action_type":"AUTO","action_key":"auto_notify_customers_delay"}]'::jsonb),

('message_delivery','Email/SMS Delivery %','system_health','daily','%',95,'95%',90,'<90%',85,'<85%','higher_is_better','brevo',38,
  '[{"step":"Check Brevo sender reputation","action_type":"INFO","action_key":"info_brevo_reputation"},
    {"step":"Check Twilio 10DLC campaign health","action_type":"INFO","action_key":"info_twilio_10dlc"},
    {"step":"Audit recent bounces","action_type":"INFO","action_key":"info_bounces_audit"},
    {"step":"Clean list of hard bounces","action_type":"AUTO","action_key":"auto_clean_hard_bounces"},
    {"step":"Warm up sender domain if new","action_type":"MANUAL"}]'::jsonb);

-- ============ Period-based targets for ramp KPIs ============
INSERT INTO public.kpi_targets (kpi_code, period_label, effective_from, effective_to, target_value, warn_threshold, critical_threshold, notes) VALUES
  ('active_subs','week_2', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', 5, 4, 3, 'Launch ramp wk1-2'),
  ('active_subs','week_6', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '42 days', 20, 16, 12, 'Wk3-6 ramp'),
  ('active_subs','day_90', CURRENT_DATE + INTERVAL '43 days', CURRENT_DATE + INTERVAL '90 days', 60, 48, 36, 'Day-90 target'),
  ('mrr','week_2', CURRENT_DATE, CURRENT_DATE + INTERVAL '14 days', 1000, 800, 500, 'MRR launch ramp'),
  ('mrr','week_6', CURRENT_DATE + INTERVAL '15 days', CURRENT_DATE + INTERVAL '42 days', 4000, 3200, 2000, 'MRR wk6'),
  ('mrr','day_90', CURRENT_DATE + INTERVAL '43 days', CURRENT_DATE + INTERVAL '90 days', 12000, 9600, 6000, 'MRR day-90'),
  ('daily_signups','week_1', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days', 1, 0, 0, 'Wk1 minimum'),
  ('daily_signups','day_90', CURRENT_DATE + INTERVAL '8 days', CURRENT_DATE + INTERVAL '90 days', 5, 2, 0, 'Ramp to 5/day');