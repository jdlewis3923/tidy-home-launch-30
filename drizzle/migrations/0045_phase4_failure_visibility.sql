-- lovable-cron-fallback-reviewed: 96 runs/day; quiet-hours SMS outbox must drain within 15 minutes of the 8am window opening, and no event exists to wake it (the trigger is the clock, not a row change).
-- Phase 4 — make failure visible.
-- 1) SMS outbox so a quiet-hours message is queued, never destroyed.
-- 2) Readers/grants for admin_alerts, stripe_events, sms_delivery_events.
-- 3) Stripe event replay bookkeeping.
-- 4) Cron health (all scheduled jobs) + staleness alarm crons.

-- ---------------------------------------------------------------- 1: outbox
CREATE TABLE IF NOT EXISTS public.sms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_phone_e164 text NOT NULL,
  body text,
  content_sid text,
  content_variables jsonb,
  idempotency_key text NOT NULL,
  template_name text,
  triggered_by text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  queued_reason text,
  release_after timestamptz NOT NULL DEFAULT now(),
  last_error text,
  twilio_sid text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_outbox_status_chk CHECK (status IN ('queued','sent','failed','canceled'))
);

GRANT SELECT ON public.sms_outbox TO authenticated;
GRANT ALL ON public.sms_outbox TO service_role;
ALTER TABLE public.sms_outbox ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_outbox' AND policyname='admins read sms outbox') THEN
    CREATE POLICY "admins read sms outbox" ON public.sms_outbox
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sms_outbox_idempotency_uidx
  ON public.sms_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS sms_outbox_pending_idx
  ON public.sms_outbox (status, release_after)
  WHERE status = 'queued';

-- --------------------------------------------------- 2: readers for failures
GRANT SELECT ON public.admin_alerts TO authenticated;
GRANT SELECT ON public.stripe_events TO authenticated;
GRANT SELECT ON public.sms_delivery_events TO authenticated;
GRANT SELECT ON public.integration_logs TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='admin_alerts' AND policyname='admins read admin alerts') THEN
    CREATE POLICY "admins read admin alerts" ON public.admin_alerts
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stripe_events' AND policyname='admins read stripe events') THEN
    CREATE POLICY "admins read stripe events" ON public.stripe_events
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sms_delivery_events' AND policyname='admins read sms delivery events') THEN
    CREATE POLICY "admins read sms delivery events" ON public.sms_delivery_events
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='integration_logs' AND policyname='admins read integration logs') THEN
    CREATE POLICY "admins read integration logs" ON public.integration_logs
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- ------------------------------------------------- 3: stripe event replay log
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS replay_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.stripe_events ADD COLUMN IF NOT EXISTS last_replay_at timestamptz;

CREATE INDEX IF NOT EXISTS stripe_events_failed_idx
  ON public.stripe_events (received_at DESC)
  WHERE status <> 'processed';

-- --------------------------------------------------------- 4: cron observability
CREATE OR REPLACE FUNCTION public.cron_expected_interval_minutes(_schedule text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  parts text[];
  mins text;
  hrs text;
  dow text;
BEGIN
  IF _schedule IS NULL THEN RETURN 1440; END IF;
  IF _schedule LIKE '@hourly%' THEN RETURN 60; END IF;
  IF _schedule LIKE '@daily%' OR _schedule LIKE '@midnight%' THEN RETURN 1440; END IF;
  IF _schedule LIKE '@weekly%' THEN RETURN 10080; END IF;
  parts := regexp_split_to_array(btrim(_schedule), '\s+');
  IF array_length(parts, 1) < 5 THEN RETURN 1440; END IF;
  mins := parts[1]; hrs := parts[2]; dow := parts[5];
  IF dow <> '*' THEN RETURN 10080; END IF;
  IF mins = '*' THEN RETURN 1; END IF;
  IF mins LIKE '*/%' THEN RETURN GREATEST(1, (split_part(mins, '/', 2))::int); END IF;
  IF hrs = '*' THEN RETURN 60; END IF;
  IF hrs LIKE '*/%' THEN RETURN GREATEST(60, (split_part(hrs, '/', 2))::int * 60); END IF;
  RETURN 1440;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cron_health()
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_status text,
  last_message text,
  expected_interval_minutes integer,
  minutes_since numeric,
  stale boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin role required';
  END IF;

  RETURN QUERY
  WITH lastrun AS (
    SELECT DISTINCT ON (d.jobid)
      d.jobid, d.start_time, d.status, d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
  )
  SELECT
    j.jobid,
    j.jobname::text,
    j.schedule::text,
    j.active,
    r.start_time,
    r.status::text,
    left(coalesce(r.return_message, ''), 300),
    public.cron_expected_interval_minutes(j.schedule),
    round(extract(epoch FROM (now() - r.start_time)) / 60.0, 1),
    (r.start_time IS NULL
      OR now() - r.start_time > (public.cron_expected_interval_minutes(j.schedule) * 3) * interval '1 minute'
      OR coalesce(r.status, 'failed') NOT IN ('succeeded','running'))
  FROM cron.job j
  LEFT JOIN lastrun r ON r.jobid = j.jobid
  ORDER BY j.jobname;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cron_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cron_health() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cron_expected_interval_minutes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cron_expected_interval_minutes(text) TO authenticated, service_role;

-- Release queued (quiet-hours) SMS every 15 minutes; heartbeat alarm hourly.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sms-outbox-release';
  PERFORM cron.schedule('sms-outbox-release', '*/15 * * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/sms-outbox-release',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key', public.admin_get_service_role_key()
      ),
      body := jsonb_build_object('at', now())
    );
  $cmd$);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cron-heartbeat';
  PERFORM cron.schedule('cron-heartbeat', '7 * * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/cron-heartbeat',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key', public.admin_get_service_role_key()
      ),
      body := jsonb_build_object('at', now())
    );
  $cmd$);
END $$;