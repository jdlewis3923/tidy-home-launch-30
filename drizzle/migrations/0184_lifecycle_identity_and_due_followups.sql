CREATE OR REPLACE FUNCTION public.lifecycle_capture_contact(_email text,_phone text,_first text,_last text,_zip text,_lang text,_sms boolean,_test boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cid uuid; normalized text; BEGIN
 normalized:=CASE WHEN _phone IS NOT NULL THEN '+1'||right(regexp_replace(_phone,'\D','','g'),10) ELSE NULL END;
 SELECT id INTO cid FROM contacts WHERE (_email IS NOT NULL AND lower(email)=lower(_email)) AND is_test=_test ORDER BY created_at LIMIT 1;
 IF cid IS NULL AND _email IS NULL THEN SELECT id INTO cid FROM contacts WHERE phone=normalized AND is_test=_test ORDER BY created_at LIMIT 1; END IF;
 IF cid IS NULL THEN
  IF EXISTS(SELECT 1 FROM contacts WHERE lower(email)=lower(_email) AND is_test<>_test) THEN RAISE EXCEPTION 'test and real identities must be separate'; END IF;
  IF EXISTS(SELECT 1 FROM contacts WHERE phone=normalized) THEN normalized:=NULL; END IF;
  INSERT INTO contacts(email,phone,first_name,last_name,zip,lang,sms_service,sms_marketing,is_test) VALUES(lower(_email),normalized,_first,_last,_zip,CASE WHEN _lang='es' THEN 'es' ELSE 'en' END,coalesce(_sms,false),false,_test) RETURNING id INTO cid;
 ELSE
  UPDATE contacts SET first_name=coalesce(first_name,_first),last_name=coalesce(last_name,_last),zip=coalesce(zip,_zip),updated_at=now() WHERE id=cid;
 END IF;
 RETURN cid;
END $$;
DO $m$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.lifecycle_contact_for_user(uuid)'::regprocedure) INTO def;
 def:=replace(def,'UPDATE contacts SET user_id=_user_id WHERE id=cid;', 'UPDATE contacts SET user_id=_user_id WHERE id=cid AND (user_id IS NULL OR user_id=_user_id);');
 EXECUTE def;
 SELECT pg_get_functiondef('public.lifecycle_capture_trigger()'::regprocedure) INTO def;
 def:=replace(def,'UPDATE contacts SET user_id=coalesce(NEW.user_id,user_id) WHERE id=cid;', 'UPDATE contacts SET user_id=coalesce(NEW.user_id,user_id) WHERE id=cid AND (user_id IS NULL OR user_id=NEW.user_id);');
 def:=replace(def,'IF NEW.status::text=''failed'' AND o->>''status'' IS DISTINCT FROM ''failed'' THEN ev:=''PAYMENT_FAILED'';', 'IF NEW.status::text=''failed'' AND o->>''status'' IS DISTINCT FROM ''failed'' THEN ev:=''PAYMENT_FAILED'';');
 def:=replace(def,'ELSIF NEW.status::text=''paid'' AND o->>''status''=''failed'' THEN ev:=''RECOVERED'';', 'ELSIF NEW.status::text=''paid'' AND o->>''status''=''failed'' THEN ev:=''RECOVERED''; IF NOT EXISTS(SELECT 1 FROM contacts WHERE user_id=uid AND welcome_at IS NOT NULL) THEN PERFORM lifecycle_emit_user(uid,''PAID'',''invoice:''||NEW.id||'':first-paid''); END IF;');
 EXECUTE def;
 SELECT pg_get_functiondef('public.lifecycle_dispatch_internal(uuid,text,text,jsonb,timestamptz,uuid)'::regprocedure) INTO def;
 def:=replace(def,'IF _event=''PAID'' AND c.welcome_at IS NOT NULL AND _simulation_id IS NULL THEN RETURN jsonb_build_object(''duplicate'',true,''stage'',c.lifecycle_stage,''messages'',''[]''::jsonb); END IF;', 'IF _event=''PAID'' AND c.welcome_at IS NOT NULL AND _simulation_id IS NULL THEN RETURN jsonb_build_object(''duplicate'',true,''stage'',c.lifecycle_stage,''messages'',''[]''::jsonb); END IF;');
 def:=replace(def,'eid,''event'',c.is_test OR _simulation_id IS NOT NULL,_simulation_id', 'eid,CASE WHEN _event IN (''WINBACK_30'',''WINBACK_90'',''COLD_45'',''COLD_90'') THEN ''stage'' ELSE ''event'' END,c.is_test OR _simulation_id IS NOT NULL,_simulation_id');
 def:=replace(def,'AND q.queue_scope=''stage''','AND q.queue_scope=''stage''');
 EXECUTE def;
 SELECT pg_get_functiondef('public.lifecycle_daily_events(timestamptz)'::regprocedure) INTO def;
 def:=replace(def,' RETURN jsonb_build_object(''ok'',true,''date'',d,''converting'',n);', $r$
 FOR c IN SELECT * FROM contacts WHERE NOT is_test AND lifecycle_stage IN ('PRICE_SEEN','RES_STARTED','CHECKOUT_ABANDONED','POPUP','CUSTOM_QUOTE') AND stage_entered_at<=_at-interval '30 days' LOOP
  PERFORM lifecycle_dispatch_internal(c.id,'COLD','cold:'||c.id||':'||c.stage_entered_at,'{}',_at);
 END LOOP;
 FOR c IN SELECT * FROM contacts WHERE NOT is_test AND lifecycle_stage='CANCELLED' AND stage_entered_at<=_at-interval '91 days' LOOP
  PERFORM lifecycle_dispatch_internal(c.id,'COLD','cold-cancel:'||c.id||':'||c.stage_entered_at,'{}',_at);
 END LOOP;
 FOR c IN SELECT * FROM contacts WHERE NOT is_test AND lifecycle_stage IN ('ACTIVE','WELCOME') AND NOT EXISTS(SELECT 1 FROM message_queue WHERE contact_id=contacts.id AND status='queued' AND queue_scope='stage') LOOP
  PERFORM lifecycle_dispatch_internal(c.id,'MONTHLY_EMAIL','next-month:'||c.id||':'||to_char(d,'YYYY-MM'), '{}',_at+interval '30 days');
  UPDATE message_queue SET queue_scope='stage' WHERE event_id=(SELECT id FROM lifecycle_events WHERE dedupe_key='next-month:'||c.id||':'||to_char(d,'YYYY-MM'));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'date',d,'converting',n);$r$);
 EXECUTE def;
END $m$;
CREATE OR REPLACE FUNCTION public.lifecycle_orphans() RETURNS SETOF public.contacts LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT c.* FROM contacts c WHERE (auth.role()='service_role' OR public.has_role(auth.uid(),'admin')) AND NOT c.is_test AND c.lifecycle_stage<>'SUPPRESSED' AND NOT EXISTS(SELECT 1 FROM message_queue q WHERE q.contact_id=c.id AND q.queue_scope='stage' AND q.status IN ('queued','sending'));
$$;