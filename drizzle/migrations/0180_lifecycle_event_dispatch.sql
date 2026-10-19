ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS welcome_at timestamptz;
CREATE INDEX IF NOT EXISTS contacts_user_idx ON public.contacts(user_id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_exp_month integer;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_exp_year integer;
CREATE TABLE public.lifecycle_event_rules (
 event text PRIMARY KEY, label_en text NOT NULL, label_es text NOT NULL,
 stage text, templates text[] NOT NULL DEFAULT '{}', marketing boolean NOT NULL DEFAULT false,
 live boolean NOT NULL DEFAULT false, urgent boolean NOT NULL DEFAULT false
);
GRANT SELECT,UPDATE ON public.lifecycle_event_rules TO authenticated;
GRANT ALL ON public.lifecycle_event_rules TO service_role;
ALTER TABLE public.lifecycle_event_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin lifecycle event rules" ON public.lifecycle_event_rules FOR ALL TO authenticated USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE TABLE public.lifecycle_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
 event text NOT NULL REFERENCES public.lifecycle_event_rules(event), dedupe_key text NOT NULL UNIQUE,
 tokens jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(),
 simulation_id uuid, prior_stage text, next_stage text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.lifecycle_events TO authenticated;
GRANT ALL ON public.lifecycle_events TO service_role;
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read lifecycle events" ON public.lifecycle_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX lifecycle_events_contact_idx ON public.lifecycle_events(contact_id,occurred_at);
ALTER TABLE public.message_queue ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.lifecycle_events(id);
ALTER TABLE public.message_queue ADD COLUMN IF NOT EXISTS queue_scope text NOT NULL DEFAULT 'stage';
ALTER TABLE public.message_queue ADD COLUMN IF NOT EXISTS force_shadow boolean NOT NULL DEFAULT false;
ALTER TABLE public.message_queue ADD COLUMN IF NOT EXISTS simulation_id uuid;
CREATE UNIQUE INDEX lifecycle_queue_event_template ON public.message_queue(event_id,template_key,channel) WHERE event_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.lifecycle_dispatch(_contact_id uuid,_event text,_key text,_tokens jsonb DEFAULT '{}',_at timestamptz DEFAULT now(),_simulation_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contacts; r public.lifecycle_event_rules; eid uuid; next_stage text; q jsonb; is_change boolean; tk jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM public.contacts WHERE id=_contact_id FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'contact not found'; END IF;
 IF _simulation_id IS NOT NULL AND NOT c.is_test THEN RAISE EXCEPTION 'simulation requires is_test contact'; END IF;
 SELECT * INTO r FROM public.lifecycle_event_rules WHERE event=_event;
 IF r.event IS NULL THEN RAISE EXCEPTION 'unknown lifecycle event: %',_event; END IF;
 SELECT id INTO eid FROM public.lifecycle_events WHERE dedupe_key=_key;
 IF eid IS NOT NULL THEN RETURN jsonb_build_object('duplicate',true,'event_id',eid,'stage',c.lifecycle_stage,'messages','[]'::jsonb); END IF;
 IF _event='PAID' AND c.welcome_at IS NOT NULL AND _simulation_id IS NULL THEN RETURN jsonb_build_object('duplicate',true,'stage',c.lifecycle_stage,'messages','[]'::jsonb); END IF;
 next_stage:=coalesce(r.stage,c.lifecycle_stage);
 -- Lead drafts must not pull a reserved or paying member backwards.
 IF _event IN ('PRICE_SEEN','RES_STARTED','OUT_OF_AREA','FOUNDING_FULL','CUSTOM_QUOTE','CHECKOUT_ABANDONED') AND c.lifecycle_stage IN ('RESERVED','CONVERTING','WELCOME','ACTIVE','PAYMENT_FAILED','PAUSE','CANCELLED') THEN next_stage:=c.lifecycle_stage; END IF;
 is_change:=next_stage IS DISTINCT FROM c.lifecycle_stage OR NOT EXISTS(SELECT 1 FROM public.message_queue WHERE contact_id=c.id AND queue_scope='stage');
 tk:=jsonb_build_object('first',coalesce(c.first_name,'there'),'link','https://jointidy.co/account','pay_link','https://jointidy.co/billing','rating_link','https://jointidy.co/account','referral_link','https://jointidy.co/refer','review_link','https://jointidy.co/refer','zip_name',coalesce(c.zip,''))||coalesce(_tokens,'{}');
 INSERT INTO public.lifecycle_events(contact_id,event,dedupe_key,tokens,occurred_at,simulation_id,prior_stage,next_stage)
 VALUES(c.id,r.event,_key,tk,_at,_simulation_id,c.lifecycle_stage,next_stage) RETURNING id INTO eid;
 IF r.stage IS NOT NULL AND is_change THEN
  UPDATE public.message_queue SET status='cancelled',error='stage advanced' WHERE contact_id=c.id AND queue_scope='stage' AND status='queued';
  UPDATE public.contacts SET lifecycle_stage=next_stage,stage_entered_at=_at,updated_at=now(),welcome_at=CASE WHEN _event='PAID' THEN coalesce(welcome_at,_at) ELSE welcome_at END WHERE id=c.id;
  INSERT INTO public.message_queue(contact_id,stage,step_order,template_key,channel,marketing,tokens,send_at,event_id,queue_scope,force_shadow,simulation_id)
  SELECT c.id,s.stage,s.step_order,s.template_key,s.channel,s.marketing,tk,public.lifecycle_next_send_time(_at+make_interval(mins=>s.delay_minutes)),eid,'stage',c.is_test OR _simulation_id IS NOT NULL,_simulation_id
  FROM public.lifecycle_sequences s WHERE s.stage=next_stage AND s.active AND s.stage NOT IN ('EVERY_VISIT','REFERRAL','CARD_EXPIRING','RETENTION_3M','RETENTION_6M','REVIEW','SKIP_PATTERN','OVERFLOW','PAYMENT_RECOVERED','MONTHLY_RECEIPT') ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO public.message_queue(contact_id,stage,template_key,channel,marketing,tokens,send_at,event_id,queue_scope,force_shadow,simulation_id)
 SELECT c.id,coalesce(r.stage,c.lifecycle_stage),t.key,t.channel,r.marketing,tk,public.lifecycle_next_send_time(_at+CASE WHEN t.key LIKE 'visit_rating_%' THEN interval '1 hour' ELSE interval '0' END),eid,'event',c.is_test OR _simulation_id IS NOT NULL,_simulation_id
 FROM public.lifecycle_templates t WHERE t.key=ANY(r.templates) AND t.active ON CONFLICT DO NOTHING;
 IF r.urgent AND NOT c.is_test AND _simulation_id IS NULL THEN
  INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,dedupe_key,context)
  VALUES('lifecycle_event','critical','operations','urgent',coalesce(c.first_name,'Member')||' needs help',_event||': '||coalesce(tk->>'reason','Review the member reply.'),'lifecycle:'||_key,jsonb_build_object('contact_id',c.id,'event_id',eid));
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'channel',m.channel,'send_at',m.send_at,'template_key',m.template_key,'status',m.status,'marketing',m.marketing,'body',CASE WHEN c.lang='es' AND t.es_reviewed THEN t.body_es ELSE t.body_en END,'subject',CASE WHEN c.lang='es' AND t.es_reviewed THEN t.subject_es ELSE t.subject_en END,'tokens',m.tokens) ORDER BY m.send_at,m.channel),'[]') INTO q FROM public.message_queue m LEFT JOIN public.lifecycle_templates t ON t.key=m.template_key AND t.channel=m.channel WHERE m.event_id=eid;
 RETURN jsonb_build_object('event_id',eid,'event',_event,'prior_stage',c.lifecycle_stage,'stage',next_stage,'duplicate',false,'messages',q);
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_dispatch(uuid,text,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_dispatch(uuid,text,text,jsonb,timestamptz,uuid) TO service_role,authenticated;
CREATE OR REPLACE FUNCTION public.lifecycle_contact_for_user(_user_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; p public.profiles; r public.reservations;
BEGIN
 SELECT id INTO cid FROM contacts WHERE user_id=_user_id ORDER BY created_at LIMIT 1;
 IF cid IS NOT NULL THEN RETURN cid; END IF;
 SELECT * INTO p FROM profiles WHERE user_id=_user_id;
 SELECT * INTO r FROM reservations WHERE user_id=_user_id ORDER BY created_at DESC LIMIT 1;
 SELECT id INTO cid FROM contacts WHERE (r.email IS NOT NULL AND lower(email)=lower(r.email)) OR (p.phone IS NOT NULL AND regexp_replace(phone,'\D','','g')=regexp_replace(p.phone,'\D','','g')) ORDER BY created_at LIMIT 1;
 IF cid IS NOT NULL THEN UPDATE contacts SET user_id=_user_id WHERE id=cid; RETURN cid; END IF;
 IF r.email IS NULL AND nullif(p.phone,'') IS NULL THEN RETURN NULL; END IF;
 INSERT INTO contacts(user_id,email,phone,first_name,last_name,zip,lang,sms_service,sms_marketing,is_test)
 VALUES(_user_id,r.email,nullif(p.phone,''),coalesce(p.first_name,r.first_name),p.last_name,p.zip,CASE WHEN p.language='es' THEN 'es' ELSE 'en' END,coalesce(p.sms_opt_in,false) AND NOT coalesce(p.sms_opt_out,false),false,coalesce(r.is_test_row,false)) RETURNING id INTO cid;
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_contact_for_user(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_contact_for_user(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.lifecycle_emit_user(_user_id uuid,_event text,_key text,_tokens jsonb DEFAULT '{}',_at timestamptz DEFAULT now()) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid;
BEGIN
 cid:=public.lifecycle_contact_for_user(_user_id);
 IF cid IS NOT NULL THEN PERFORM public.lifecycle_dispatch(cid,_event,_key,_tokens,_at); END IF;
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_emit_user(uuid,text,text,jsonb,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_emit_user(uuid,text,text,jsonb,timestamptz) TO service_role;
CREATE OR REPLACE FUNCTION public.lifecycle_set_stage(_contact_id uuid,_stage text,_tokens jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ev text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT event INTO ev FROM lifecycle_event_rules WHERE stage=_stage ORDER BY event LIMIT 1;
 IF ev IS NULL THEN RAISE EXCEPTION 'Use a registered lifecycle event'; END IF;
 PERFORM lifecycle_dispatch(_contact_id,ev,'stage:'||_contact_id||':'||_stage||':'||(SELECT stage_entered_at::text FROM contacts WHERE id=_contact_id),_tokens);
END $$;
CREATE OR REPLACE FUNCTION public.lifecycle_orphans() RETURNS SETOF public.contacts LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.* FROM contacts c WHERE (auth.role()='service_role' OR public.has_role(auth.uid(),'admin')) AND c.lifecycle_stage<>'SUPPRESSED' AND NOT EXISTS(SELECT 1 FROM message_queue q WHERE q.contact_id=c.id AND q.queue_scope='stage' AND q.status='queued');
$$;
REVOKE ALL ON FUNCTION public.lifecycle_orphans() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_orphans() TO authenticated,service_role;