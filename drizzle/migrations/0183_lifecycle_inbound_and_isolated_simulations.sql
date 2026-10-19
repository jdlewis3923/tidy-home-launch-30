CREATE OR REPLACE FUNCTION public.lifecycle_inbound_reply(_phone text,_body text,_sid text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contacts; v public.visits; kw text:=upper(regexp_replace(_body,'[^a-zA-Z0-9]','','g')); rating_value integer; rid uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF kw NOT IN ('1','2','3','4','5','FIX') THEN RETURN jsonb_build_object('handled',false); END IF;
 SELECT * INTO c FROM contacts WHERE right(regexp_replace(phone,'\D','','g'),10)=right(regexp_replace(_phone,'\D','','g'),10) ORDER BY created_at LIMIT 1;
 IF c.id IS NULL OR c.user_id IS NULL OR c.sms_stopped THEN RETURN jsonb_build_object('handled',false); END IF;
 SELECT * INTO v FROM visits WHERE user_id=c.user_id AND status::text='complete' AND completed_at>=now()-interval '48 hours' AND NOT is_redo AND NOT is_sample ORDER BY completed_at DESC LIMIT 1;
 IF v.id IS NULL THEN RETURN jsonb_build_object('handled',false); END IF;
 IF kw='FIX' THEN
  IF NOT EXISTS(SELECT 1 FROM redo_requests WHERE visit_id=v.id AND status<>'canceled') THEN
   INSERT INTO redo_requests(visit_id,user_id,pro_id,note,source,requested_at,due_at,is_test_row)
   VALUES(v.id,c.user_id,v.assigned_pro_id,'Member replied FIX; review booked scope before arranging return.','sms',now(),now()+interval '48 hours',c.is_test) RETURNING id INTO rid;
  END IF;
  PERFORM lifecycle_dispatch_internal(c.id,'FIX','sms:'||_sid,jsonb_build_object('visit_id',v.id,'reason','Member requested a scope-reviewed redo'));
 ELSE
  rating_value:=kw::integer;
  IF NOT EXISTS(SELECT 1 FROM visit_ratings WHERE visit_id=v.id AND raw_identifier='sms:'||_sid) THEN
   INSERT INTO visit_ratings(visit_id,user_id,customer_id,contractor_id,rating,stars,source,lang,raw_identifier,verified)
   VALUES(v.id,c.user_id,c.user_id,v.assigned_pro_id,rating_value,rating_value,'sms_reply',c.lang,'sms:'||_sid,true);
  END IF;
 END IF;
 RETURN jsonb_build_object('handled',true,'visit_id',v.id,'redo_id',rid);
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_inbound_reply(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_inbound_reply(text,text,text) TO service_role;
DO $m$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public.lifecycle_capture_trigger()'::regprocedure) INTO def;
 def:=replace(def,'WHEN NEW.founding IS FALSE THEN ''FOUNDING_FULL'' ELSE ''RESERVED'' END','ELSE ''RESERVED'' END');
 EXECUTE def;
END $m$;
CREATE OR REPLACE FUNCTION public.lifecycle_simulate(_contact_id uuid,_event text DEFAULT NULL,_journey boolean DEFAULT false,_tokens jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contacts; sid uuid:=gen_random_uuid(); timeline jsonb:='[]'; out jsonb; ev text; i integer:=0; at_time timestamptz:=now(); cloned uuid; duplicate_ok boolean; orphan_count integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM contacts WHERE id=_contact_id AND is_test;
 IF c.id IS NULL THEN RAISE EXCEPTION 'choose an is_test contact'; END IF;
 INSERT INTO contacts(email,first_name,last_name,zip,lang,lifecycle_stage,sms_service,sms_marketing,email_marketing,is_test)
 VALUES('sim-'||sid||'@example.invalid',c.first_name,c.last_name,c.zip,c.lang,CASE WHEN _journey THEN 'PRICE_SEEN' ELSE c.lifecycle_stage END,true,true,true,true) RETURNING id INTO cloned;
 IF _journey THEN
  FOREACH ev IN ARRAY ARRAY['PRICE_SEEN','RESERVED','CONVERTING','PAID','PRO_ASSIGNED','VISIT_REMINDER','ON_THE_WAY','ARRIVED','VISIT_COMPLETE','RATING_LOW','FIX','VISIT_COMPLETE','REVIEW','VISIT_COMPLETE','REFERRAL','PAYMENT_FAILED','RECOVERED','PAUSED','CANCELLED','WINBACK_30','WINBACK_90','COLD','COLD_45','COLD_90'] LOOP
   i:=i+1; at_time:=now()+make_interval(mins=>i*5);
   out:=lifecycle_dispatch_internal(cloned,ev,'simulation:'||sid||':'||i,_tokens||jsonb_build_object('visit_id','test-visit-'||i,'rating',2),at_time,sid);
   timeline:=timeline||jsonb_build_array(out);
  END LOOP;
 ELSE out:=lifecycle_dispatch_internal(cloned,_event,'simulation:'||sid||':1',_tokens,at_time,sid); timeline:=jsonb_build_array(out); END IF;
 out:=lifecycle_dispatch_internal(cloned,CASE WHEN _journey THEN 'PRICE_SEEN' ELSE _event END,'simulation:'||sid||':1',_tokens,at_time,sid);
 duplicate_ok:=(out->>'duplicate')::boolean;
 SELECT count(*) INTO orphan_count FROM contacts x WHERE x.id=cloned AND NOT EXISTS(SELECT 1 FROM message_queue q WHERE q.contact_id=x.id AND q.status='queued' AND q.queue_scope='stage');
 UPDATE message_queue SET status='dry_run',sent_at=now() WHERE simulation_id=sid AND status='queued';
 RETURN jsonb_build_object('simulation_id',sid,'shadow',true,'timeline',timeline,'duplicate_protection',duplicate_ok,'orphans',orphan_count,'messages',(SELECT count(*) FROM message_queue WHERE simulation_id=sid));
END $$;