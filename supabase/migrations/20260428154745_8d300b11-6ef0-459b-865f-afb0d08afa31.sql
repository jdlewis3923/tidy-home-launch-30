-- Enable required extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create a log table to track cron run results
CREATE TABLE IF NOT EXISTS public.cron_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name text NOT NULL,
  request_id bigint,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  context jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cron_runs admin select"
  ON public.cron_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Unschedule any existing job with this name (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('daily_addon_attach_scan');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Schedule daily at 14:00 UTC (10:00 AM America/New_York during EDT)
SELECT cron.schedule(
  'daily_addon_attach_scan',
  '0 14 * * *',
  $$
  WITH req AS (
    SELECT net.http_post(
      url := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/daily-addon-attach-scan',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Zap-Webhook-Secret', 'zRiwIm05bpGIJYloTYwUx9hY5ARZbCAuHYNNNanHDsEOr7s9'
      ),
      body := jsonb_build_object(
        'days_window_start', 5,
        'days_window_end', 7
      )
    ) AS request_id
  )
  INSERT INTO public.cron_runs (job_name, request_id, context)
  SELECT 'daily_addon_attach_scan', request_id, jsonb_build_object('schedule', '0 14 * * * UTC')
  FROM req;
  $$
);
