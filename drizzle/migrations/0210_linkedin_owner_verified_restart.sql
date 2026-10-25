CREATE OR REPLACE FUNCTION public.linkedin_enable_calendar()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.linkedin_publishing_control;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM linkedin_publishing_control WHERE id=true FOR UPDATE;
 IF c.photo_test_id IS NULL OR c.text_test_id IS NULL OR (SELECT count(*) FROM social_launch_posts WHERE id IN (c.photo_test_id,c.text_test_id) AND status='posted' AND posted_at IS NOT NULL AND external_post_id IS NOT NULL)<>2 THEN RAISE EXCEPTION 'Photo and text test posts must both be confirmed live'; END IF;
 UPDATE social_launch_posts s SET status='scheduled',publish_error=null WHERE channel='linkedin' AND archived_at IS NULL AND NOT is_test AND status='draft' AND scheduled_for>now() AND linkedin_urn IS NULL AND NOT EXISTS(SELECT 1 FROM social_publish_ledger l WHERE l.post_id=s.id);
 UPDATE linkedin_publishing_control SET enabled=true,updated_at=now() WHERE id=true;
END $function$;

-- Release also removes the attempt's delivery token (FK), so the button works.
CREATE OR REPLACE FUNCTION public.linkedin_manual_release(_post uuid, _reason text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l public.social_publish_ledger; p public.social_launch_posts;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO p FROM social_launch_posts WHERE id=_post FOR UPDATE;
  IF p.id IS NULL OR p.channel<>'linkedin' OR p.is_test OR p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Post is not an active LinkedIn post'; END IF;
  IF p.linkedin_urn IS NOT NULL OR p.external_post_id IS NOT NULL THEN RAISE EXCEPTION 'Confirmed LinkedIn post cannot be resent'; END IF;
  SELECT * INTO l FROM social_publish_ledger WHERE post_id=_post AND platform='linkedin' FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'No LinkedIn publish attempt found for this post'; END IF;
  IF l.platform_post_id IS NOT NULL THEN RAISE EXCEPTION 'Conflicting release'; END IF;
  DELETE FROM social_delivery_tokens WHERE ledger_id=l.id;
  DELETE FROM social_publish_ledger WHERE id=l.id;
  UPDATE social_launch_posts SET status='draft',publish_error=null,scheduled_for=null,
    notes=concat_ws(E'\n',notes,'Owner confirmed on '||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')||' UTC this post never went live; released for rescheduling.'||CASE WHEN coalesce(nullif(btrim(_reason),''),'')<>'' THEN ' Reason: '||left(btrim(_reason),200) ELSE '' END)
  WHERE id=_post;
  UPDATE admin_alerts SET resolved_at=now() WHERE dedupe_key='linkedin_unconfirmed:'||_post::text AND resolved_at IS NULL;
END $function$;

UPDATE social_publish_ledger SET state='posted', confirmed_at=now(), error='Owner verified live on LinkedIn page (screenshot 2026-10-23); post link not captured'
 WHERE post_id='93b7b783-7027-596c-bb4a-6663c092db5c' AND platform='linkedin' AND platform_post_id IS NULL;
UPDATE social_launch_posts SET status='posted', posted_at=coalesce(posted_at,'2026-10-21 00:51:46+00'), external_post_id='linkedin:owner-verified:93b7b783-7027-596c-bb4a-6663c092db5c', publish_error=null,
 notes=concat_ws(E'\n',notes,'Owner verified live on 2026-10-23 from LinkedIn page screenshot.')
 WHERE id='93b7b783-7027-596c-bb4a-6663c092db5c';

DELETE FROM social_delivery_tokens WHERE ledger_id IN (SELECT id FROM social_publish_ledger WHERE platform='linkedin' AND platform_post_id IS NULL AND post_id IN ('2eaeeb7b-e053-5ac9-8c9b-ada120aa4b41','33da9bd6-9dbf-594f-954c-9836b51c2edd'));
DELETE FROM social_publish_ledger WHERE platform='linkedin' AND platform_post_id IS NULL AND post_id IN ('2eaeeb7b-e053-5ac9-8c9b-ada120aa4b41','33da9bd6-9dbf-594f-954c-9836b51c2edd');
UPDATE social_launch_posts SET status='draft', publish_error=null, scheduled_for=null,
 notes=concat_ws(E'\n',notes,'Owner confirmed on 2026-10-25 this post never went live; released for rescheduling.')
 WHERE id IN ('2eaeeb7b-e053-5ac9-8c9b-ada120aa4b41','33da9bd6-9dbf-594f-954c-9836b51c2edd') AND linkedin_urn IS NULL;

UPDATE admin_alerts SET resolved_at=now() WHERE resolved_at IS NULL AND dedupe_key IN (
 'linkedin_unconfirmed:93b7b783-7027-596c-bb4a-6663c092db5c','linkedin_unconfirmed:2eaeeb7b-e053-5ac9-8c9b-ada120aa4b41','linkedin_unconfirmed:33da9bd6-9dbf-594f-954c-9836b51c2edd');

UPDATE social_launch_posts s SET status='scheduled',publish_error=null WHERE channel='linkedin' AND archived_at IS NULL AND NOT is_test AND status='draft' AND scheduled_for>now() AND linkedin_urn IS NULL AND NOT EXISTS(SELECT 1 FROM social_publish_ledger l WHERE l.post_id=s.id);
UPDATE linkedin_publishing_control SET enabled=true,updated_at=now() WHERE id=true;