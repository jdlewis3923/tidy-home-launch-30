CREATE TABLE IF NOT EXISTS public.pro_notification_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pro_notification_claims_unique UNIQUE (contractor_id, kind, scope)
);

GRANT ALL ON public.pro_notification_claims TO service_role;
GRANT SELECT ON public.pro_notification_claims TO authenticated;

ALTER TABLE public.pro_notification_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read pro notification claims" ON public.pro_notification_claims;
CREATE POLICY "admins read pro notification claims"
ON public.pro_notification_claims
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.claim_pro_notification(
  _contractor_id UUID,
  _kind TEXT,
  _scope TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.pro_notification_claims (contractor_id, kind, scope)
  VALUES (_contractor_id, _kind, _scope)
  ON CONFLICT (contractor_id, kind, scope) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pro_notification(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pro_notification(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.visits_notify_pro_canceled_today()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'canceled'
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.assigned_pro_id IS NOT NULL
     AND NEW.scheduled_start IS NOT NULL
     AND (NEW.scheduled_start AT TIME ZONE 'America/New_York')::date
         = (now() AT TIME ZONE 'America/New_York')::date
  THEN
    PERFORM public.call_edge_function(
      'notify-pro-visit-canceled',
      jsonb_build_object('visit_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visits_notify_pro_canceled_today ON public.visits;
CREATE TRIGGER visits_notify_pro_canceled_today
AFTER UPDATE OF status ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.visits_notify_pro_canceled_today();

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-pro-job-today';
  PERFORM cron.schedule('notify-pro-job-today', '0 12 * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/notify-pro-job-today',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key', public.admin_get_service_role_key()
      ),
      body := jsonb_build_object('at', now())
    );
  $cmd$);
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'notify-pro-visit-tomorrow';
  PERFORM cron.schedule('notify-pro-visit-tomorrow', '0 21 * * *', $cmd$
    SELECT net.http_post(
      url := (SELECT rtrim(value #>> '{}', '/') FROM public.app_settings WHERE key = 'edge_functions_base_url') || '/notify-pro-visit-tomorrow',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-key', public.admin_get_service_role_key()
      ),
      body := jsonb_build_object('at', now())
    );
  $cmd$);
END $$;