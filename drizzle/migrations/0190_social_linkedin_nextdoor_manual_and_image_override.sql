
-- 1. Claim: LinkedIn is claimable (published via the LinkedIn Zap webhook in the app publisher);
--    Nextdoor is manual-only: never auto-claimed, never swept to missed.
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(_limit int DEFAULT 10,_only uuid DEFAULT NULL) RETURNS SETOF public.social_launch_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.social_launch_posts;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_single_publisher'));
 UPDATE public.social_launch_posts SET status='missed',publish_error='Missed slot; reschedule explicitly',updated_at=now() WHERE archived_at IS NULL AND NOT is_test AND status IN ('scheduled','armed','failed') AND external_post_id IS NULL AND posted_at IS NULL AND channel<>'nextdoor' AND scheduled_for<now()-interval '5 minutes';
 IF EXISTS(SELECT 1 FROM public.social_launch_posts WHERE status='posting' AND NOT is_test AND archived_at IS NULL) THEN RETURN; END IF;
 SELECT * INTO r FROM public.social_launch_posts WHERE NOT is_test AND archived_at IS NULL AND status IN ('scheduled','armed') AND posted_at IS NULL AND external_post_id IS NULL AND channel IN ('facebook','instagram','meta_combined','linkedin') AND scheduled_for<=now() AND scheduled_for>=now()-interval '5 minutes' ORDER BY scheduled_for,id LIMIT 1 FOR UPDATE;
 IF r.id IS NULL OR (_only IS NOT NULL AND r.id<>_only) THEN RETURN; END IF;
 UPDATE public.social_launch_posts SET status='posting',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION public.claim_due_social_posts(int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_posts(int,uuid) TO service_role;

-- 2. Reservation: optional image override (Instagram JPEG derived from the locked PNG at publish time).
DROP FUNCTION IF EXISTS public.social_reserve_publish(uuid,text,text,text,boolean,timestamptz);
CREATE OR REPLACE FUNCTION public.social_reserve_publish(_id uuid,_platform text,_caption text,_image_hash text,_dry_run boolean DEFAULT false,_at timestamptz DEFAULT NULL,_image_url text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.social_launch_posts; t timestamptz:=now(); h text; l uuid; reason text; v_image text;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_platform:'||_platform));
 SELECT * INTO p FROM public.social_launch_posts WHERE id=_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Post missing'; END IF;
 IF _dry_run AND NOT p.is_test THEN RAISE EXCEPTION 'Dry-run requires a test post'; END IF;
 IF _at IS NOT NULL AND NOT (_dry_run AND p.is_test) THEN RAISE EXCEPTION 'Clock override requires isolated dry-run'; END IF;
 t:=coalesce(_at,t); h:=public.social_caption_hash(_caption); v_image:=coalesce(nullif(trim(_image_url),''),p.image_url);
 IF _platform NOT IN ('facebook','instagram','nextdoor','linkedin') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
 IF (_platform='facebook' AND p.channel NOT IN ('facebook','meta_combined')) OR (_platform='instagram' AND p.channel NOT IN ('instagram','meta_combined')) OR (_platform IN ('nextdoor','linkedin') AND p.channel<>_platform) THEN RAISE EXCEPTION 'Wrong platform for post'; END IF;
 IF p.external_post_id IS NOT NULL OR p.posted_at IS NOT NULL OR EXISTS(SELECT 1 FROM social_publish_ledger WHERE post_id=p.id AND platform=_platform) THEN RETURN jsonb_build_object('ok',false,'reason','already_attempted_or_confirmed'); END IF;
 IF p.archived_at IS NOT NULL OR p.status NOT IN ('posting','scheduled','armed') THEN reason:='not_publishable';
 ELSIF p.scheduled_for IS NULL OR p.scheduled_for>t THEN reason:='not_due';
 ELSIF p.scheduled_for<t-interval '5 minutes' THEN reason:='missed';
 ELSIF nullif(trim(v_image),'') IS NULL OR _image_hash IS NULL OR length(_image_hash)<>64 THEN reason:='missing_image';
 ELSIF h IS NULL THEN reason:='missing_copy';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND (NOT p.is_test OR post_id IN (SELECT id FROM social_launch_posts WHERE theme=p.theme)) AND created_at>=t-interval '90 days' AND state IN ('posted','posting','dry_run') AND (content_hash=h OR image_hash=_image_hash)) THEN reason:='repeat_within_90_days';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND (NOT p.is_test OR post_id IN (SELECT id FROM social_launch_posts WHERE theme=p.theme)) AND scheduled_for=p.scheduled_for) THEN reason:='slot_already_used';
 ELSIF EXISTS(SELECT 1 FROM social_launch_posts o WHERE o.id<>p.id AND o.is_test=p.is_test AND (NOT p.is_test OR o.theme=p.theme) AND o.archived_at IS NULL AND o.status IN ('scheduled','armed','posting') AND o.scheduled_for<p.scheduled_for AND (( _platform='facebook' AND o.channel IN ('facebook','meta_combined')) OR (_platform='instagram' AND o.channel IN ('instagram','meta_combined')) OR o.channel=_platform)) THEN reason:='earlier_post_pending'; END IF;
 IF reason IS NOT NULL THEN UPDATE social_launch_posts SET status=CASE WHEN reason='missed' THEN 'missed' ELSE 'blocked' END,publish_error=reason WHERE id=p.id; RETURN jsonb_build_object('ok',false,'reason',reason); END IF;
 UPDATE social_launch_posts SET image_hash=_image_hash,rendered_caption=_caption WHERE id=p.id;
 INSERT INTO social_publish_ledger(post_id,platform,scheduled_for,caption,content_hash,image_url,image_hash,state,is_test,created_at) VALUES(p.id,_platform,p.scheduled_for,_caption,h,v_image,_image_hash,CASE WHEN _dry_run THEN 'dry_run' ELSE 'posting' END,p.is_test,t) RETURNING id INTO l;
 RETURN jsonb_build_object('ok',true,'ledger_id',l,'caption',_caption,'image_url',v_image,'image_hash',_image_hash,'scheduled_for',p.scheduled_for);
END $$;
REVOKE ALL ON FUNCTION public.social_reserve_publish(uuid,text,text,text,boolean,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.social_reserve_publish(uuid,text,text,text,boolean,timestamptz,text) TO service_role;

-- 3. Manual marking: allowed for Nextdoor only (no posting connection exists); every other
--    platform still requires platform confirmation through the sole app publisher.
CREATE OR REPLACE FUNCTION public.admin_mark_social_posted(_id uuid,_external text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.social_launch_posts;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO p FROM public.social_launch_posts WHERE id=_id;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Post missing'; END IF;
 IF p.channel<>'nextdoor' THEN RAISE EXCEPTION 'Manual marking is allowed for Nextdoor only; other platforms confirm through the app publisher'; END IF;
 IF p.posted_at IS NOT NULL OR p.external_post_id IS NOT NULL THEN RAISE EXCEPTION 'Already marked posted'; END IF;
 UPDATE public.social_launch_posts SET status='posted',posted_at=now(),external_post_id=coalesce(_external,'nextdoor:manual'),publish_error=NULL,updated_at=now() WHERE id=p.id;
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_social_posted(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_social_posted(uuid,text) TO authenticated;
