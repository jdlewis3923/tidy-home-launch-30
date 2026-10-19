CREATE OR REPLACE FUNCTION public.social_reserve_publish(_id uuid,_platform text,_caption text,_image_hash text,_dry_run boolean DEFAULT false,_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.social_launch_posts; t timestamptz:=now(); h text; l uuid; reason text;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_platform:'||_platform)); SELECT * INTO p FROM public.social_launch_posts WHERE id=_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Post missing'; END IF;
 IF _dry_run AND NOT p.is_test THEN RAISE EXCEPTION 'Dry-run requires a test post'; END IF;
 IF _at IS NOT NULL AND NOT (_dry_run AND p.is_test) THEN RAISE EXCEPTION 'Clock override requires isolated dry-run'; END IF;
 t:=coalesce(_at,t);h:=public.social_caption_hash(_caption);
 IF _platform NOT IN ('facebook','instagram','nextdoor','linkedin') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
 IF (_platform='facebook' AND p.channel NOT IN ('facebook','meta_combined')) OR (_platform='instagram' AND p.channel NOT IN ('instagram','meta_combined')) OR (_platform IN ('nextdoor','linkedin') AND p.channel<>_platform) THEN RAISE EXCEPTION 'Wrong platform for post'; END IF;
 IF EXISTS(SELECT 1 FROM social_publish_ledger WHERE post_id=p.id AND platform=_platform) OR (p.external_post_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM social_publish_ledger WHERE post_id=p.id)) THEN RETURN jsonb_build_object('ok',false,'reason','already_attempted_or_confirmed'); END IF;
 IF p.archived_at IS NOT NULL OR p.status NOT IN ('posting','scheduled','armed') THEN reason:='not_publishable';
 ELSIF p.scheduled_for IS NULL OR p.scheduled_for>t THEN reason:='not_due';
 ELSIF p.scheduled_for<t-interval '5 minutes' THEN reason:='missed';
 ELSIF nullif(trim(p.image_url),'') IS NULL OR _image_hash IS NULL OR length(_image_hash)<>64 THEN reason:='missing_image';
 ELSIF h IS NULL THEN reason:='missing_copy';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND created_at>=t-interval '90 days' AND state IN ('posted','posting','dry_run') AND (content_hash=h OR image_hash=_image_hash)) THEN reason:='repeat_within_90_days';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND scheduled_for=p.scheduled_for) THEN reason:='slot_already_used';
 ELSIF EXISTS(SELECT 1 FROM social_launch_posts o WHERE o.id<>p.id AND o.is_test=p.is_test AND o.archived_at IS NULL AND o.status IN ('scheduled','armed','posting') AND o.scheduled_for<p.scheduled_for AND ((_platform='facebook' AND o.channel IN ('facebook','meta_combined')) OR (_platform='instagram' AND o.channel IN ('instagram','meta_combined')) OR o.channel=_platform)) THEN reason:='earlier_post_pending'; END IF;
 IF reason IS NOT NULL THEN UPDATE social_launch_posts SET status=CASE WHEN reason='missed' THEN 'missed' ELSE 'blocked' END,publish_error=reason WHERE id=p.id; RETURN jsonb_build_object('ok',false,'reason',reason); END IF;
 UPDATE social_launch_posts SET image_hash=_image_hash,rendered_caption=_caption WHERE id=p.id;
 INSERT INTO social_publish_ledger(post_id,platform,scheduled_for,caption,content_hash,image_url,image_hash,state,is_test,created_at) VALUES(p.id,_platform,p.scheduled_for,_caption,h,p.image_url,_image_hash,CASE WHEN _dry_run THEN 'dry_run' ELSE 'posting' END,p.is_test,t) RETURNING id INTO l;
 RETURN jsonb_build_object('ok',true,'ledger_id',l,'caption',_caption,'image_url',p.image_url,'image_hash',_image_hash,'scheduled_for',p.scheduled_for);
END $$;