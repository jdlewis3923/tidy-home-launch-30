CREATE OR REPLACE FUNCTION public.social_caption_hash(_c text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN nullif(btrim(_c),'') IS NULL THEN NULL ELSE md5(lower(regexp_replace(btrim(_c), '\s+', ' ', 'g'))) END $$;
CREATE OR REPLACE FUNCTION public.social_post_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h text := public.social_caption_hash(NEW.caption);
BEGIN
  IF NEW.archived_at IS NOT NULL OR NEW.status IN ('archived','draft','skipped') THEN RETURN NEW; END IF;
  IF NEW.status IN ('scheduled','armed','posting') THEN
    IF h IS NULL THEN RAISE EXCEPTION 'needs_copy: a post needs copy before it can be scheduled'; END IF;
    IF NEW.channel IN ('instagram','meta_combined') AND nullif(btrim(coalesce(NEW.image_url,'')),'') IS NULL THEN
      RAISE EXCEPTION 'instagram_needs_image: Instagram posts must have an image';
    END IF;
  END IF;
  IF h IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.social_launch_posts o
     WHERE o.id <> NEW.id AND o.archived_at IS NULL AND o.status NOT IN ('archived','skipped','draft')
       AND o.content_hash = h
       AND abs(extract(epoch FROM (o.scheduled_for - NEW.scheduled_for))) < 90 * 86400) THEN
    RAISE EXCEPTION 'duplicate_copy: the same copy is already scheduled within 90 days';
  END IF;
  RETURN NEW;
END $$;