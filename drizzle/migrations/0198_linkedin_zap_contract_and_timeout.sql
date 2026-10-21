-- lovable-cron-fallback-reviewed: Wake minute checks only on enqueue and unschedule after drain; no delayed provider is configured. Maximum 1440 checks/day if continuously pending, normally about ten per send.
ALTER TABLE public.social_launch_posts ADD COLUMN linkedin_urn text, ADD COLUMN linkedin_url text;
ALTER TABLE public.social_launch_posts DROP CONSTRAINT social_launch_posts_status_check;
ALTER TABLE public.social_launch_posts ADD CONSTRAINT social_launch_posts_status_check CHECK(status IN ('draft','pending','image_uploaded','scheduled','armed','posting','posted','failed','skipped','archived','missed','blocked','unconfirmed'));
CREATE UNIQUE INDEX social_linkedin_urn_unique ON public.social_launch_posts(linkedin_urn) WHERE linkedin_urn IS NOT NULL;
CREATE TABLE public.linkedin_publishing_control(id boolean PRIMARY KEY DEFAULT true CHECK(id), enabled boolean NOT NULL DEFAULT false, photo_test_id uuid, text_test_id uuid, updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.linkedin_publishing_control TO service_role;
GRANT SELECT ON public.linkedin_publishing_control TO authenticated;
ALTER TABLE public.linkedin_publishing_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY linkedin_control_admin_read ON public.linkedin_publishing_control FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE POLICY linkedin_control_service ON public.linkedin_publishing_control FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE OR REPLACE FUNCTION public.linkedin_expire_unconfirmed() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p record; n integer:=0;
BEGIN
 FOR p IN SELECT s.id FROM social_launch_posts s JOIN social_publish_ledger l ON l.post_id=s.id AND l.platform='linkedin' WHERE s.archived_at IS NULL AND NOT s.is_test AND s.linkedin_urn IS NULL AND l.platform_post_id IS NULL AND l.state='posting' AND l.created_at<=now()-interval '10 minutes' AND s.status<>'unconfirmed' FOR UPDATE OF s LOOP
 UPDATE social_launch_posts SET status='unconfirmed',publish_error='No LinkedIn callback within 10 minutes; never resend automatically' WHERE id=p.id AND linkedin_urn IS NULL;
 INSERT INTO admin_alerts(alert_type,title,body,context,level,category,tier,dedupe_key,action_url,action_label) VALUES('operations_action','LinkedIn post unconfirmed','No callback arrived within 10 minutes. Check the Zap run and company page. The post will not be resent.',jsonb_build_object('post_id',p.id),'action','operations','urgent','linkedin_unconfirmed:'||p.id::text,'/admin/social?platform=linkedin&post='||p.id::text,'Check LinkedIn') ON CONFLICT(dedupe_key) DO NOTHING;
 UPDATE linkedin_publishing_control SET enabled=false,updated_at=now() WHERE id=true;
 n:=n+1;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM social_publish_ledger l JOIN social_launch_posts s ON s.id=l.post_id WHERE l.platform='linkedin' AND l.state='posting' AND l.platform_post_id IS NULL AND s.status<>'unconfirmed' AND s.archived_at IS NULL AND NOT s.is_test) THEN PERFORM cron.unschedule('linkedin-confirmation-watchdog'); END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_expire_unconfirmed() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.linkedin_expire_unconfirmed() TO service_role;
CREATE OR REPLACE FUNCTION public.linkedin_arm_watchdog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NEW.platform='linkedin' AND NEW.state='posting' AND NOT NEW.is_test THEN PERFORM cron.schedule('linkedin-confirmation-watchdog','* * * * *','select public.linkedin_expire_unconfirmed();'); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER linkedin_arm_watchdog AFTER INSERT ON public.social_publish_ledger FOR EACH ROW EXECUTE FUNCTION public.linkedin_arm_watchdog();
CREATE OR REPLACE FUNCTION public.linkedin_confirm_receipt(_post uuid,_token uuid,_urn text,_url text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.social_publish_ledger; p public.social_launch_posts;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT q.* INTO l FROM social_publish_ledger q JOIN social_delivery_tokens t ON t.ledger_id=q.id WHERE q.post_id=_post AND q.platform='linkedin' AND t.token=_token FOR UPDATE OF q;
 IF l.id IS NULL THEN RAISE EXCEPTION 'Invalid receipt authorization'; END IF;
 SELECT * INTO p FROM social_launch_posts WHERE id=_post FOR UPDATE;
 IF (l.platform_post_id IS NOT NULL AND l.platform_post_id<>_urn) OR (p.linkedin_urn IS NOT NULL AND p.linkedin_urn<>_urn) THEN RAISE EXCEPTION 'Conflicting confirmation'; END IF;
 UPDATE social_publish_ledger SET state='posted',platform_post_id=_urn,post_url=_url,confirmed_at=coalesce(confirmed_at,now()),error=null WHERE id=l.id;
 UPDATE social_launch_posts SET linkedin_urn=_urn,linkedin_url=_url,status='posted',posted_at=coalesce(posted_at,now()),external_post_id='linkedin:'||_urn,publish_error=null WHERE id=_post;
 UPDATE admin_alerts SET resolved_at=now() WHERE dedupe_key='linkedin_unconfirmed:'||_post::text AND resolved_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_confirm_receipt(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.linkedin_confirm_receipt(uuid,uuid,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.linkedin_prepare_live_test(_kind text) RETURNS SETOF public.social_launch_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.social_launch_posts; c public.linkedin_publishing_control;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _kind NOT IN ('photo','text') THEN RAISE EXCEPTION 'Invalid test kind'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('linkedin_live_tests'));
 SELECT * INTO c FROM linkedin_publishing_control WHERE id=true FOR UPDATE;
 IF c.id IS NULL OR c.enabled THEN RAISE EXCEPTION 'Test mode unavailable'; END IF;
 IF (_kind='photo' AND c.photo_test_id IS NOT NULL) OR (_kind='text' AND c.text_test_id IS NOT NULL) THEN RAISE EXCEPTION 'Live test already attempted; do not resend'; END IF;
 SELECT * INTO p FROM social_launch_posts s WHERE channel='linkedin' AND archived_at IS NULL AND NOT is_test AND linkedin_urn IS NULL AND posted_at IS NULL AND external_post_id IS NULL AND status IN ('draft','scheduled','armed','missed') AND ((_kind='photo' AND media_kind IN ('image','banner')) OR (_kind='text' AND media_kind='text')) AND NOT EXISTS(SELECT 1 FROM social_publish_ledger l WHERE l.post_id=s.id) ORDER BY scheduled_for,id LIMIT 1 FOR UPDATE;
 IF p.id IS NULL THEN RAISE EXCEPTION 'No unattempted post available'; END IF;
 UPDATE social_launch_posts SET original_scheduled_for=coalesce(original_scheduled_for,scheduled_for),scheduled_for=now(),status='posting',manual_schedule=true,publish_error=null,notes=concat_ws(E'\n',notes,'Moved forward for owner-authorized live LinkedIn test Oct 21 UTC') WHERE id=p.id RETURNING * INTO p;
 UPDATE linkedin_publishing_control SET photo_test_id=CASE WHEN _kind='photo' THEN p.id ELSE photo_test_id END,text_test_id=CASE WHEN _kind='text' THEN p.id ELSE text_test_id END,updated_at=now() WHERE id=true;
 RETURN NEXT p;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_prepare_live_test(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.linkedin_prepare_live_test(text) TO service_role;
CREATE OR REPLACE FUNCTION public.linkedin_enable_calendar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.linkedin_publishing_control;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM linkedin_publishing_control WHERE id=true FOR UPDATE;
 IF c.photo_test_id IS NULL OR c.text_test_id IS NULL OR (SELECT count(*) FROM social_launch_posts WHERE id IN (c.photo_test_id,c.text_test_id) AND status='posted' AND linkedin_urn IS NOT NULL AND linkedin_url IS NOT NULL)<>2 THEN RAISE EXCEPTION 'Photo and text must both have confirmed LinkedIn URLs'; END IF;
 UPDATE social_launch_posts s SET status='scheduled',publish_error=null WHERE channel='linkedin' AND archived_at IS NULL AND NOT is_test AND status='draft' AND scheduled_for>now() AND linkedin_urn IS NULL AND NOT EXISTS(SELECT 1 FROM social_publish_ledger l WHERE l.post_id=s.id);
 UPDATE linkedin_publishing_control SET enabled=true,updated_at=now() WHERE id=true;
END $$;
REVOKE ALL ON FUNCTION public.linkedin_enable_calendar() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.linkedin_enable_calendar() TO service_role;
CREATE OR REPLACE FUNCTION public.claim_due_social_posts(_limit int DEFAULT 10,_only uuid DEFAULT NULL) RETURNS SETOF public.social_launch_posts LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.social_launch_posts;
BEGIN
 IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('social_single_publisher'));
 UPDATE social_launch_posts SET status='missed',publish_error='Missed slot; reschedule explicitly' WHERE archived_at IS NULL AND NOT is_test AND status IN ('scheduled','armed','failed') AND external_post_id IS NULL AND posted_at IS NULL AND channel<>'nextdoor' AND scheduled_for<now()-interval '5 minutes';
 IF EXISTS(SELECT 1 FROM social_launch_posts WHERE status='posting' AND NOT is_test AND archived_at IS NULL AND channel<>'linkedin') THEN RETURN; END IF;
 SELECT * INTO r FROM social_launch_posts s WHERE NOT is_test AND archived_at IS NULL AND status IN ('scheduled','armed') AND posted_at IS NULL AND external_post_id IS NULL AND linkedin_urn IS NULL AND channel IN ('facebook','instagram','meta_combined','linkedin') AND (channel<>'linkedin' OR EXISTS(SELECT 1 FROM linkedin_publishing_control WHERE id=true AND enabled)) AND scheduled_for<=now() AND scheduled_for>=now()-interval '5 minutes' AND NOT EXISTS(SELECT 1 FROM social_publish_ledger l WHERE l.post_id=s.id AND l.platform=s.channel) ORDER BY scheduled_for,id LIMIT 1 FOR UPDATE;
 IF r.id IS NULL OR (_only IS NOT NULL AND r.id<>_only) THEN RETURN; END IF;
 UPDATE social_launch_posts SET status='posting' WHERE id=r.id RETURNING * INTO r; RETURN NEXT r;
END $$;
CREATE OR REPLACE FUNCTION public.linkedin_prevent_urn_resend() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF OLD.linkedin_urn IS NOT NULL AND (NEW.linkedin_urn IS DISTINCT FROM OLD.linkedin_urn OR NEW.status IN ('scheduled','armed','posting')) THEN RAISE EXCEPTION 'Confirmed LinkedIn post cannot be resent'; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER linkedin_prevent_urn_resend BEFORE UPDATE ON public.social_launch_posts FOR EACH ROW EXECUTE FUNCTION public.linkedin_prevent_urn_resend();