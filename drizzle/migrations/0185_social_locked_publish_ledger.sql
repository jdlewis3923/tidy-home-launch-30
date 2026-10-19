ALTER TABLE public.social_launch_posts ADD COLUMN IF NOT EXISTS image_hash text, ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS manual_schedule boolean NOT NULL DEFAULT false;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS image_url text, ADD COLUMN IF NOT EXISTS image_hash text;
COMMENT ON TABLE public.social_posts IS 'DEPRECATED publishing queue: historical inventory only. Sole publisher uses social_launch_posts plus social_publish_ledger.';
ALTER TABLE public.social_launch_posts DROP CONSTRAINT IF EXISTS social_launch_posts_status_check;
ALTER TABLE public.social_launch_posts ADD CONSTRAINT social_launch_posts_status_check CHECK(status IN ('draft','pending','image_uploaded','scheduled','armed','posting','posted','failed','skipped','archived','missed','blocked'));
CREATE TABLE public.social_publish_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), post_id uuid NOT NULL REFERENCES public.social_launch_posts(id), platform text NOT NULL CHECK(platform IN ('facebook','instagram','nextdoor','linkedin')), scheduled_for timestamptz NOT NULL, caption text NOT NULL, content_hash text NOT NULL, image_url text NOT NULL, image_hash text NOT NULL, state text NOT NULL DEFAULT 'posting' CHECK(state IN ('posting','posted','failed','dry_run')), platform_post_id text, confirmed_at timestamptz, error text, is_test boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(post_id,platform)
);
GRANT SELECT ON public.social_publish_ledger TO authenticated;
GRANT ALL ON public.social_publish_ledger TO service_role;
ALTER TABLE public.social_publish_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_ledger_admin_read ON public.social_publish_ledger FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX social_ledger_content_idx ON public.social_publish_ledger(platform,content_hash,created_at);
CREATE INDEX social_ledger_image_idx ON public.social_publish_ledger(platform,image_hash,created_at);
CREATE OR REPLACE FUNCTION public.social_post_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND (OLD.posted_at IS NOT NULL OR OLD.external_post_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.social_publish_ledger WHERE post_id=OLD.id)) AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.template_copy IS DISTINCT FROM OLD.template_copy OR NEW.image_url IS DISTINCT FROM OLD.image_url OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for) THEN RAISE EXCEPTION 'Confirmed or attempted posts are immutable; create a new post instead'; END IF;
 IF TG_OP='UPDATE' AND NEW.image_url IS DISTINCT FROM OLD.image_url THEN NEW.image_hash:=NULL; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS social_post_guard ON public.social_launch_posts;
CREATE TRIGGER social_post_guard BEFORE INSERT OR UPDATE ON public.social_launch_posts FOR EACH ROW EXECUTE FUNCTION public.social_post_guard();
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(_limit int DEFAULT 10,_only uuid DEFAULT NULL) RETURNS SETOF public.social_launch_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.social_launch_posts;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_single_publisher'));
 UPDATE public.social_launch_posts SET status='missed',publish_error='Missed slot; reschedule explicitly',updated_at=now() WHERE archived_at IS NULL AND NOT is_test AND status IN ('scheduled','armed','failed') AND external_post_id IS NULL AND posted_at IS NULL AND scheduled_for<now()-interval '5 minutes';
 IF EXISTS(SELECT 1 FROM public.social_launch_posts WHERE status='posting' AND NOT is_test AND archived_at IS NULL) THEN RETURN; END IF;
 SELECT * INTO r FROM public.social_launch_posts WHERE NOT is_test AND archived_at IS NULL AND status IN ('scheduled','armed') AND posted_at IS NULL AND external_post_id IS NULL AND scheduled_for<=now() AND scheduled_for>=now()-interval '5 minutes' ORDER BY scheduled_for,id LIMIT 1 FOR UPDATE;
 IF r.id IS NULL OR (_only IS NOT NULL AND r.id<>_only) THEN RETURN; END IF;
 IF r.channel NOT IN ('facebook','instagram','meta_combined') THEN UPDATE public.social_launch_posts SET status='blocked',publish_error='No direct app publishing connection for this platform; no Zapier dispatch' WHERE id=r.id; RETURN; END IF;
 UPDATE public.social_launch_posts SET status='posting',updated_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN NEXT r;
END $$;
REVOKE ALL ON FUNCTION public.claim_due_social_posts(int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_social_posts(int,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.social_reserve_publish(_id uuid,_platform text,_caption text,_image_hash text,_dry_run boolean DEFAULT false,_at timestamptz DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.social_launch_posts; t timestamptz:=now(); h text; l uuid; reason text;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_platform:'||_platform));
 SELECT * INTO p FROM public.social_launch_posts WHERE id=_id FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Post missing'; END IF;
 IF _dry_run AND NOT p.is_test THEN RAISE EXCEPTION 'Dry-run requires a test post'; END IF;
 IF _at IS NOT NULL AND NOT (_dry_run AND p.is_test) THEN RAISE EXCEPTION 'Clock override requires isolated dry-run'; END IF;
 t:=coalesce(_at,t); h:=public.social_caption_hash(_caption);
 IF _platform NOT IN ('facebook','instagram','nextdoor','linkedin') THEN RAISE EXCEPTION 'Invalid platform'; END IF;
 IF (_platform='facebook' AND p.channel NOT IN ('facebook','meta_combined')) OR (_platform='instagram' AND p.channel NOT IN ('instagram','meta_combined')) OR (_platform IN ('nextdoor','linkedin') AND p.channel<>_platform) THEN RAISE EXCEPTION 'Wrong platform for post'; END IF;
 IF p.external_post_id IS NOT NULL OR p.posted_at IS NOT NULL OR EXISTS(SELECT 1 FROM social_publish_ledger WHERE post_id=p.id AND platform=_platform) THEN RETURN jsonb_build_object('ok',false,'reason','already_attempted_or_confirmed'); END IF;
 IF p.archived_at IS NOT NULL OR p.status NOT IN ('posting','scheduled','armed') THEN reason:='not_publishable';
 ELSIF p.scheduled_for IS NULL OR p.scheduled_for>t THEN reason:='not_due';
 ELSIF p.scheduled_for<t-interval '5 minutes' THEN reason:='missed';
 ELSIF nullif(trim(p.image_url),'') IS NULL OR _image_hash IS NULL OR length(_image_hash)<>64 THEN reason:='missing_image';
 ELSIF h IS NULL THEN reason:='missing_copy';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND created_at>=t-interval '90 days' AND state IN ('posted','posting','dry_run') AND (content_hash=h OR image_hash=_image_hash)) THEN reason:='repeat_within_90_days';
 ELSIF EXISTS(SELECT 1 FROM social_publish_ledger WHERE platform=_platform AND is_test=p.is_test AND scheduled_for=p.scheduled_for) THEN reason:='slot_already_used';
 ELSIF EXISTS(SELECT 1 FROM social_launch_posts o WHERE o.id<>p.id AND o.is_test=p.is_test AND o.archived_at IS NULL AND o.status IN ('scheduled','armed','posting') AND o.scheduled_for<p.scheduled_for AND (( _platform='facebook' AND o.channel IN ('facebook','meta_combined')) OR (_platform='instagram' AND o.channel IN ('instagram','meta_combined')) OR o.channel=_platform)) THEN reason:='earlier_post_pending'; END IF;
 IF reason IS NOT NULL THEN UPDATE social_launch_posts SET status=CASE WHEN reason='missed' THEN 'missed' ELSE 'blocked' END,publish_error=reason WHERE id=p.id; RETURN jsonb_build_object('ok',false,'reason',reason); END IF;
 UPDATE social_launch_posts SET image_hash=_image_hash,rendered_caption=_caption WHERE id=p.id;
 INSERT INTO social_publish_ledger(post_id,platform,scheduled_for,caption,content_hash,image_url,image_hash,state,is_test,created_at) VALUES(p.id,_platform,p.scheduled_for,_caption,h,p.image_url,_image_hash,CASE WHEN _dry_run THEN 'dry_run' ELSE 'posting' END,p.is_test,t) RETURNING id INTO l;
 RETURN jsonb_build_object('ok',true,'ledger_id',l,'caption',_caption,'image_url',p.image_url,'image_hash',_image_hash,'scheduled_for',p.scheduled_for);
END $$;
REVOKE ALL ON FUNCTION public.social_reserve_publish(uuid,text,text,text,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.social_reserve_publish(uuid,text,text,text,boolean,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.social_confirm_publish(_ledger uuid,_platform_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.social_publish_ledger;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF nullif(trim(_platform_id),'') IS NULL THEN RAISE EXCEPTION 'Platform confirmation required'; END IF;
 UPDATE social_publish_ledger SET state='posted',platform_post_id=_platform_id,confirmed_at=now() WHERE id=_ledger AND state='posting' RETURNING * INTO l;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Attempt missing or already confirmed'; END IF;
 UPDATE social_launch_posts SET posted_at=coalesce(posted_at,now()), external_post_id=concat_ws(' ',external_post_id,l.platform||':'||_platform_id),updated_at=now() WHERE id=l.post_id;
END $$;
REVOKE ALL ON FUNCTION public.social_confirm_publish(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.social_confirm_publish(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.dispatch_due_social_posts() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT 0 $$;
CREATE OR REPLACE FUNCTION public.admin_mark_social_posted(_id uuid,_external text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RAISE EXCEPTION 'Manual marking disabled: platform confirmation must come from the sole app publisher'; END $$;
CREATE OR REPLACE FUNCTION public.reservation_test_no_founding() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF coalesce(NEW.is_test_row,false) THEN NEW.founding:=false; NEW.founding_number:=NULL; NEW.founding_zip:=NULL; NEW.founding_date:=NULL; END IF; RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.assign_founding_reservation_status() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text; v_zip text; g public.founding_grants; v_next int;
BEGIN
 NEW.rate_card_version:=public.current_rate_card_version(); NEW.founding:=false; NEW.founding_number:=NULL; NEW.founding_zip:=NULL; NEW.founding_date:=NULL;
 IF coalesce(NEW.is_test_row,false) OR NEW.status='canceled' OR coalesce(cardinality(NEW.waitlist_services),0)>0 THEN RETURN NEW; END IF;
 v_zip:=left(trim(NEW.zip),5); IF v_zip NOT IN ('33156','33183','33186') THEN RETURN NEW; END IF;
 v_key:=public.founding_address_key(NEW.street,NEW.zip); PERFORM pg_advisory_xact_lock(hashtext('founding_zip:'||v_zip));
 SELECT * INTO g FROM public.founding_grants WHERE address_key=v_key;
 IF FOUND THEN IF g.status='active' THEN NEW.founding:=true; NEW.founding_number:=g.founding_number; NEW.founding_zip:=g.founding_zip; NEW.founding_date:=g.granted_at; NEW.rate_card_version:=g.rate_card_version; END IF; RETURN NEW; END IF;
 SELECT coalesce(max(founding_number),0)+1 INTO v_next FROM public.founding_grants WHERE founding_zip=v_zip; IF v_next>25 THEN RETURN NEW; END IF;
 INSERT INTO public.founding_grants(founding_zip,founding_number,address_key,reservation_id,email,rate_card_version) VALUES(v_zip,v_next,v_key,NEW.id,lower(NEW.email),NEW.rate_card_version) RETURNING * INTO g;
 INSERT INTO public.founding_audit(grant_id,event,reason,detail) VALUES(g.id,'granted','reservation',jsonb_build_object('zip',v_zip,'number',v_next,'reservation_id',NEW.id)); NEW.founding:=true; NEW.founding_number:=g.founding_number; NEW.founding_zip:=g.founding_zip; NEW.founding_date:=g.granted_at; RETURN NEW;
END $$;