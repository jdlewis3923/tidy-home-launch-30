CREATE TABLE IF NOT EXISTS public.social_launch_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('nextdoor','instagram','facebook','meta_combined')),
  post_number int NOT NULL,
  scheduled_for timestamptz NOT NULL,
  title text,
  caption text NOT NULL,
  image_url text,
  image_filename text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','image_uploaded','scheduled','posted','skipped')),
  scheduled_in_native_tool_at timestamptz,
  posted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.social_launch_posts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='social_launch_posts' AND policyname='admin all social_launch_posts') THEN
    CREATE POLICY "admin all social_launch_posts"
    ON public.social_launch_posts FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_social_launch_posts_updated_at') THEN
    CREATE TRIGGER update_social_launch_posts_updated_at
    BEFORE UPDATE ON public.social_launch_posts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_slp_scheduled_for ON public.social_launch_posts(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_slp_channel ON public.social_launch_posts(channel);
CREATE INDEX IF NOT EXISTS idx_slp_status ON public.social_launch_posts(status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_slp_channel_postnum ON public.social_launch_posts(channel, post_number);

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-images', 'social-images', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='admin read social-images') THEN
    CREATE POLICY "admin read social-images" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'social-images' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='admin insert social-images') THEN
    CREATE POLICY "admin insert social-images" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'social-images' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='admin update social-images') THEN
    CREATE POLICY "admin update social-images" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'social-images' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='admin delete social-images') THEN
    CREATE POLICY "admin delete social-images" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'social-images' AND public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;