ALTER TABLE public.social_launch_posts DROP CONSTRAINT IF EXISTS social_launch_posts_status_check;
ALTER TABLE public.social_launch_posts ADD CONSTRAINT social_launch_posts_status_check
  CHECK (status = ANY (ARRAY['draft','pending','image_uploaded','scheduled','armed','posting','posted','failed','skipped','archived']));
ALTER TABLE public.social_launch_posts
  ADD COLUMN IF NOT EXISTS content_hash text GENERATED ALWAYS AS (
    CASE WHEN nullif(btrim(caption),'') IS NULL THEN NULL ELSE md5(lower(regexp_replace(btrim(caption), '\s+', ' ', 'g'))) END) STORED,
  ADD COLUMN IF NOT EXISTS external_post_id text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS theme text;
CREATE INDEX IF NOT EXISTS social_launch_posts_hash_idx ON public.social_launch_posts (content_hash) WHERE archived_at IS NULL;

-- Server rules: same copy never twice within 90 days; nothing scheduled without copy; Instagram always has an image.
CREATE OR REPLACE FUNCTION public.social_post_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL OR NEW.status IN ('archived','draft','skipped') THEN RETURN NEW; END IF;
  IF NEW.status IN ('scheduled','armed','posting') THEN
    IF NEW.content_hash IS NULL THEN RAISE EXCEPTION 'needs_copy: a post needs copy before it can be scheduled'; END IF;
    IF NEW.channel IN ('instagram','meta_combined') AND nullif(btrim(coalesce(NEW.image_url,'')),'') IS NULL THEN
      RAISE EXCEPTION 'instagram_needs_image: Instagram posts must have an image';
    END IF;
  END IF;
  IF NEW.content_hash IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.social_launch_posts o
     WHERE o.id <> NEW.id AND o.archived_at IS NULL AND o.status NOT IN ('archived','skipped','draft')
       AND o.content_hash = NEW.content_hash
       AND abs(extract(epoch FROM (o.scheduled_for - NEW.scheduled_for))) < 90 * 86400) THEN
    RAISE EXCEPTION 'duplicate_copy: the same copy is already scheduled within 90 days';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS social_post_guard ON public.social_launch_posts;
CREATE TRIGGER social_post_guard BEFORE INSERT OR UPDATE OF caption, status, scheduled_for, image_url, archived_at ON public.social_launch_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_post_guard();

-- The pull: claims due posts and marks them in the same statement, so a retry or an overlapping run can never publish one twice.
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(_limit int DEFAULT 10, _only uuid DEFAULT NULL)
RETURNS SETOF public.social_launch_posts LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.social_launch_posts p SET status = 'posting', updated_at = now()
   WHERE p.id IN (
     SELECT id FROM public.social_launch_posts
      WHERE status IN ('scheduled','armed') AND posted_at IS NULL AND archived_at IS NULL
        AND channel <> 'nextdoor'
        AND (CASE WHEN _only IS NULL THEN scheduled_for <= now() ELSE id = _only END)
      ORDER BY scheduled_for LIMIT _limit
      FOR UPDATE SKIP LOCKED)
  RETURNING p.*;
$$;
REVOKE ALL ON FUNCTION public.claim_due_social_posts(int, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_posts(int, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_mark_social_posted(_id uuid, _external text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.social_launch_posts SET status = 'posted', posted_at = coalesce(posted_at, now()), external_post_id = coalesce(_external, external_post_id), updated_at = now()
   WHERE id = _id AND archived_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_social_posted(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_social_posted(uuid, text) TO authenticated;

-- One door: retire the second publisher (old social_posts table, no recurring rules).
DO $$ BEGIN PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'social-posts-publisher'; END $$;