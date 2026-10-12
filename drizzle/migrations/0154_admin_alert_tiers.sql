ALTER TABLE public.admin_alerts
  ADD COLUMN IF NOT EXISTS tier text,
  ADD COLUMN IF NOT EXISTS night_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS what text,
  ADD COLUMN IF NOT EXISTS why_today text,
  ADD COLUMN IF NOT EXISTS if_ignored text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_result text,
  ADD COLUMN IF NOT EXISTS route_to text NOT NULL DEFAULT 'owner';

CREATE TABLE IF NOT EXISTS public.admin_alert_tiers (
  rule_key text PRIMARY KEY,
  label text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('urgent','digest','dashboard')),
  night_ok boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.admin_alert_tiers TO authenticated;
GRANT ALL ON public.admin_alert_tiers TO service_role;
ALTER TABLE public.admin_alert_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alert tiers" ON public.admin_alert_tiers FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.admin_alert_tier_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  old_tier text, new_tier text, old_night_ok boolean, new_night_ok boolean,
  changed_by uuid, changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_alert_tier_log TO authenticated;
GRANT ALL ON public.admin_alert_tier_log TO service_role;
ALTER TABLE public.admin_alert_tier_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read alert tier log" ON public.admin_alert_tier_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.admin_digest_runs (
  edition text NOT NULL, run_date date NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(),
  email_result text, sms_result text, body jsonb,
  PRIMARY KEY (edition, run_date)
);
GRANT SELECT ON public.admin_digest_runs TO authenticated;
GRANT ALL ON public.admin_digest_runs TO service_role;
ALTER TABLE public.admin_digest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read digest runs" ON public.admin_digest_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

INSERT INTO public.app_settings(key, value) VALUES ('alert_coordinator_routing', 'false'::jsonb) ON CONFLICT (key) DO NOTHING;

INSERT INTO public.admin_alert_tiers(rule_key, label, tier, night_ok) VALUES
 ('level:critical','Any critical alert without its own rule','urgent',false),
 ('level:action','Any action alert without its own rule','digest',false),
 ('level:warning','Any warning without its own rule','digest',false),
 ('operations_critical','Operations — critical (unsafe stop, visit without a Pro)','urgent',false),
 ('insurance_critical','Insurance — expired with visits booked','urgent',false),
 ('calendar_critical','Hire or car care decision due today','urgent',false),
 ('hiring_critical','Hiring — deadline today','urgent',false),
 ('capacity_critical','Capacity over 100% / service must pause','urgent',false),
 ('site_critical','Site or checkout down','urgent',true),
 ('money_critical','Money — Stripe payout failed or chargeback','urgent',false),
 ('safety_critical','Safety: unsafe stop, injury, damage, incident','urgent',true),
 ('calendar_action','Calendar task due today','digest',false),
 ('calendar_warning','Calendar task coming up','digest',false),
 ('hiring_action','Hiring — needs action','digest',false),
 ('hiring_warning','Hiring — warning','digest',false),
 ('reservations_action','Reservations — action','digest',false),
 ('capacity_warning','Capacity — warning','digest',false),
 ('capacity_action','Capacity — action','digest',false),
 ('site_warning','Site — warning','digest',false),
 ('operations_action','Operations — action (e.g. size mismatch)','digest',false),
 ('insurance_action','Insurance — renew soon','digest',false),
 ('new_applicant','Each new applicant','dashboard',false),
 ('cron_snapshot_failed','Scheduled-job health snapshot failed','digest',false),
 ('cron_stale','A scheduled job stopped running','digest',false),
 ('cron_snapshot_empty','Scheduled-job snapshot empty','digest',false),
 ('cron_manifest_drift','Scheduled jobs differ from the list','digest',false),
 ('cron_manifest_check_failed','Scheduled-job check failed','digest',false),
 ('sms_outbox_failed','Customer text failed','urgent',false),
 ('kpi_alert_sms_failed','KPI alert text failed','digest',false),
 ('capacity_alert_sms_failed','Capacity alert text failed','digest',false),
 ('sheets_master_sync_failed','Google Sheet sync failed','digest',false),
 ('documenso_envelope_signed','Contract signed','dashboard',false),
 ('documenso_envelope_failed','Contract send failed','digest',false),
 ('pro_notification_undeliverable','Pro notice undeliverable','digest',false),
 ('pro_push_failed','Pro push failed','digest',false),
 ('pro_push_outbox_failed','Pro push outbox failed','digest',false),
 ('pro_onboarding_email_failed','Pro onboarding email failed','digest',false),
 ('pro_high_demand_crossing','Pro high-demand crossing','digest',false),
 ('preferred_pro_substitution_urgent','Preferred Pro substitution needed today','urgent',false),
 ('training_reminder_send_failed','Training reminder failed','digest',false),
 ('insurance_reminder_send_failed','Insurance reminder failed','digest',false),
 ('applicant_nudge_send_failed','Applicant nudge failed','digest',false),
 ('applicant_email_failed','Applicant email failed','digest',false),
 ('bg_check_notification_failed','Background-check notice failed','digest',false),
 ('checkr_report_needs_review','Background check needs review','digest',false),
 ('checkr_invite_dispatch_failed','Background-check invite failed','digest',false),
 ('low_visit_rating','Low visit rating','digest',false),
 ('scheduler_paused','Scheduler paused','urgent',false),
 ('addon_needs_quote','Add-on needs a quote','digest',false),
 ('addon_declined_condition','Add-on declined for condition','dashboard',false),
 ('addon_charge_orphaned','Add-on charge not linked','digest',false),
 ('addon_charge_failed','Add-on charge failed','digest',false),
 ('admin_email','Routine email to you (held for digest)','digest',false),
 ('admin_text','Routine text to you (held for digest)','digest',false)
ON CONFLICT (rule_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_alert_assign_tier()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NEW.tier IS NULL THEN
    SELECT t.tier, t.night_ok INTO r FROM public.admin_alert_tiers t
     WHERE t.rule_key IN (NEW.alert_type, coalesce(NEW.category,'') || '_' || NEW.level, 'level:' || NEW.level)
     ORDER BY CASE WHEN t.rule_key = NEW.alert_type THEN 1 WHEN t.rule_key LIKE 'level:%' THEN 3 ELSE 2 END LIMIT 1;
    NEW.tier := coalesce(r.tier, 'digest');
    IF coalesce(r.night_ok, false) THEN NEW.night_ok := true; END IF;
  END IF;
  IF NEW.tier <> 'urgent' AND coalesce((SELECT value #>> '{}' FROM public.app_settings WHERE key='alert_coordinator_routing'),'false') = 'true' THEN
    NEW.route_to := 'coordinator';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.resolved_at IS NOT NULL AND NEW.resolved_at IS NULL THEN
    NEW.notified_at := NULL; NEW.reminded_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_alert_assign_tier ON public.admin_alerts;
CREATE TRIGGER admin_alert_assign_tier BEFORE INSERT OR UPDATE ON public.admin_alerts
  FOR EACH ROW EXECUTE FUNCTION public.admin_alert_assign_tier();

-- Urgent alerts are sent the moment they are written (no polling).
CREATE OR REPLACE FUNCTION public.admin_alert_dispatch_now()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tier = 'urgent' AND NEW.notified_at IS NULL AND NEW.resolved_at IS NULL THEN
    BEGIN
      PERFORM public.cron_http_post('admin-alert-dispatch:urgent', 'admin-alert-dispatch', jsonb_build_object('mode','urgent','alert_id',NEW.id));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- the row stays; the hourly pass and the 9 AM digest pick it up
    END;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS admin_alert_dispatch_now ON public.admin_alerts;
CREATE TRIGGER admin_alert_dispatch_now AFTER INSERT OR UPDATE OF tier, resolved_at ON public.admin_alerts
  FOR EACH ROW EXECUTE FUNCTION public.admin_alert_dispatch_now();

UPDATE public.admin_alerts SET tier = NULL, notified_at = coalesce(notified_at, created_at) WHERE tier IS NULL;

CREATE OR REPLACE FUNCTION public.admin_set_alert_tier(_rule text, _tier text, _night_ok boolean DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE o record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _tier NOT IN ('urgent','digest','dashboard') THEN RAISE EXCEPTION 'bad_tier'; END IF;
  SELECT * INTO o FROM public.admin_alert_tiers WHERE rule_key = _rule FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_rule'; END IF;
  UPDATE public.admin_alert_tiers SET tier = _tier, night_ok = coalesce(_night_ok, night_ok), updated_at = now(), updated_by = auth.uid() WHERE rule_key = _rule;
  INSERT INTO public.admin_alert_tier_log(rule_key, old_tier, new_tier, old_night_ok, new_night_ok, changed_by)
  VALUES (_rule, o.tier, _tier, o.night_ok, coalesce(_night_ok, o.night_ok), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_alert_tier(text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_alert_tier(text, text, boolean) TO authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN
    ('hiring-digest-morning','hiring-digest-evening','kpi-digest-morning','kpi-digest-midday','kpi-digest-evening','kpi-digest-launch','kpi-digest-weekly','kpi-plan-digest-am','kpi-plan-digest-pm','reviews-weekly-digest','admin-alert-dispatch');
END $$;
-- Hourly: 4-hour reminders, plus the 9 AM / 9 PM ET digests (the function checks the ET hour, so DST is handled).
SELECT cron.schedule('admin-alert-dispatch', '0 * * * *', $job$SELECT public.cron_http_post('admin-alert-dispatch', 'admin-alert-dispatch', '{"mode":"hourly"}'::jsonb);$job$);