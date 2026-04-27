-- 1. Status enum
DO $$ BEGIN
  CREATE TYPE public.social_post_status AS ENUM ('scheduled', 'ready', 'posting', 'posted', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. social_posts table
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_number int NOT NULL,
  scheduled_at timestamptz NOT NULL,
  image_path text NOT NULL,
  caption text NOT NULL DEFAULT '',
  status public.social_post_status NOT NULL DEFAULT 'scheduled',
  ig_post_id text,
  fb_post_id text,
  error_message text,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_status_sched_idx
  ON public.social_posts (status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_day_idx
  ON public.social_posts (day_number);

-- updated_at trigger
DROP TRIGGER IF EXISTS social_posts_set_updated_at ON public.social_posts;
CREATE TRIGGER social_posts_set_updated_at
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. RLS — admin only
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_posts_admin_select ON public.social_posts;
CREATE POLICY social_posts_admin_select ON public.social_posts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS social_posts_admin_insert ON public.social_posts;
CREATE POLICY social_posts_admin_insert ON public.social_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS social_posts_admin_update ON public.social_posts;
CREATE POLICY social_posts_admin_update ON public.social_posts
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS social_posts_admin_delete ON public.social_posts;
CREATE POLICY social_posts_admin_delete ON public.social_posts
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Storage bucket: public read so Meta Graph can fetch image_url
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-images', 'social-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS policies
DROP POLICY IF EXISTS "social-images public read" ON storage.objects;
CREATE POLICY "social-images public read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'social-images');

DROP POLICY IF EXISTS "social-images admin insert" ON storage.objects;
CREATE POLICY "social-images admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'social-images'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "social-images admin update" ON storage.objects;
CREATE POLICY "social-images admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'social-images'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "social-images admin delete" ON storage.objects;
CREATE POLICY "social-images admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'social-images'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

-- Ensure pg_cron + pg_net extensions exist (needed for the scheduler)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;