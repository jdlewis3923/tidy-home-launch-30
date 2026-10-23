-- Owner-verified LinkedIn confirmation: the Zap's photo path does not call back the
-- receipt, so the owner confirms a post that is verifiably live on LinkedIn by
-- pasting its link. Same guards as the automatic receipt: URN uniqueness, no
-- conflicting confirmation, never an is_test or archived row.
CREATE OR REPLACE FUNCTION public.linkedin_manual_confirm(_post uuid, _url text, _urn text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.social_publish_ledger;
  p public.social_launch_posts;
  v_urn text := nullif(btrim(coalesce(_urn,'')),'');
  v_url text := nullif(btrim(coalesce(_url,'')),'');
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  IF v_urn IS NULL AND v_url IS NOT NULL THEN
    v_urn := substring(v_url from 'urn:li:(?:share|ugcPost|activity):[0-9]+');
  END IF;
  IF v_urn IS NULL OR v_url IS NULL
     OR v_urn !~ '^urn:li:(share|ugcPost|activity):[0-9]+$'
     OR v_url !~* '^https://(www\.)?linkedin\.com/(feed/update/urn:li:(share|ugcPost|activity):[0-9]+|posts/[0-9]+)'
  THEN RAISE EXCEPTION 'Paste the LinkedIn post link (linkedin.com/feed/update/urn:li:...)'; END IF;
  SELECT * INTO p FROM social_launch_posts WHERE id=_post FOR UPDATE;
  IF p.id IS NULL OR p.channel<>'linkedin' OR p.is_test OR p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Post is not an active LinkedIn post'; END IF;
  IF p.linkedin_urn IS NOT NULL AND p.linkedin_urn<>v_urn THEN RAISE EXCEPTION 'Conflicting confirmation'; END IF;
  SELECT * INTO l FROM social_publish_ledger WHERE post_id=_post AND platform='linkedin' FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'No LinkedIn publish attempt found for this post'; END IF;
  IF l.platform_post_id IS NOT NULL AND l.platform_post_id<>v_urn THEN RAISE EXCEPTION 'Conflicting confirmation'; END IF;
  UPDATE social_publish_ledger SET state='posted',platform_post_id=v_urn,post_url=v_url,confirmed_at=coalesce(confirmed_at,now()),error=null WHERE id=l.id;
  UPDATE social_launch_posts SET linkedin_urn=v_urn,linkedin_url=v_url,status='posted',posted_at=coalesce(posted_at,now()),external_post_id='linkedin:'||v_urn,publish_error=null WHERE id=_post;
  UPDATE admin_alerts SET resolved_at=now() WHERE dedupe_key='linkedin_unconfirmed:'||_post::text AND resolved_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_manual_confirm(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.linkedin_manual_confirm(uuid,text,text) TO authenticated, service_role;

-- Owner says a held post never went live: release it for explicit rescheduling.
-- Only a post with no URN and an unconfirmed attempt qualifies; the rejected
-- ledger row is deleted (its wording and outcome are copied into post notes)
-- because the publisher refuses any post that already has a ledger row.
CREATE OR REPLACE FUNCTION public.linkedin_manual_release(_post uuid, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  l public.social_publish_ledger;
  p public.social_launch_posts;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
  SELECT * INTO p FROM social_launch_posts WHERE id=_post FOR UPDATE;
  IF p.id IS NULL OR p.channel<>'linkedin' OR p.is_test OR p.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Post is not an active LinkedIn post'; END IF;
  IF p.linkedin_urn IS NOT NULL OR p.external_post_id IS NOT NULL THEN RAISE EXCEPTION 'Confirmed LinkedIn post cannot be resent'; END IF;
  SELECT * INTO l FROM social_publish_ledger WHERE post_id=_post AND platform='linkedin' FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'No LinkedIn publish attempt found for this post'; END IF;
  IF l.platform_post_id IS NOT NULL THEN RAISE EXCEPTION 'Conflicting release'; END IF;
  DELETE FROM social_publish_ledger WHERE id=l.id;
  UPDATE social_launch_posts SET status='draft',publish_error=null,scheduled_for=null,
    notes=concat_ws(E'\n',notes,'Owner confirmed on '||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')||' UTC this post never went live; released for rescheduling.'||CASE WHEN coalesce(nullif(btrim(_reason),''),'')<>'' THEN ' Reason: '||left(btrim(_reason),200) ELSE '' END)
  WHERE id=_post;
  UPDATE admin_alerts SET resolved_at=now() WHERE dedupe_key='linkedin_unconfirmed:'||_post::text AND resolved_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_manual_release(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.linkedin_manual_release(uuid,text) TO authenticated, service_role;