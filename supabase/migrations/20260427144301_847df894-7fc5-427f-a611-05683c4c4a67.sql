ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS image_paths text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.social_posts.image_paths IS
  'When non-empty, post is a carousel/multi-photo post. image_path is still set to the first slide for previews.';