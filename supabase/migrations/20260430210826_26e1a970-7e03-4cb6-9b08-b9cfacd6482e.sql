-- Add 'armed' and 'failed' to status constraint, add armed_at, and create admin_alerts table
ALTER TABLE public.social_launch_posts DROP CONSTRAINT social_launch_posts_status_check;
ALTER TABLE public.social_launch_posts ADD CONSTRAINT social_launch_posts_status_check 
  CHECK (status = ANY (ARRAY['pending'::text, 'image_uploaded'::text, 'scheduled'::text, 'armed'::text, 'posted'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE public.social_launch_posts ADD COLUMN IF NOT EXISTS armed_at timestamptz;
ALTER TABLE public.social_launch_posts ADD COLUMN IF NOT EXISTS publish_error text;

-- Admin alerts table for manual-post fallbacks etc.
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type text NOT NULL,
  title text NOT NULL,
  body text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_alerts admin all" ON public.admin_alerts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- social-images bucket already exists; ensure public read for image_url to work (admin uploads only)
UPDATE storage.buckets SET public = true WHERE id = 'social-images';