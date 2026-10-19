CREATE OR REPLACE FUNCTION public.lifecycle_daily_events(_at timestamptz DEFAULT now()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d date:=(_at AT TIME ZONE 'America/New_York')::date; c record; v record; s record; n integer:=0; cfg record; expiry date;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO cfg FROM launch_config WHERE scope='home';
 IF cfg.scope IS NULL THEN SELECT * INTO cfg FROM launch_config WHERE conversion_date IS NOT NULL ORDER BY scope LIMIT 1; END IF;
 IF cfg.conversion_date IS NOT NULL AND d>=cfg.conversion_date THEN
  FOR c IN SELECT * FROM contacts WHERE lifecycle_stage='RESERVED' AND NOT is_test LOOP
   IF EXISTS(SELECT 1 FROM reservations r WHERE lower(r.email)=lower(c.email) AND NOT r.is_test_row AND NOT r.car_waiting) THEN
    PERFORM lifecycle_dispatch_internal(c.id,'CONVERTING','convert:'||c.id||':'||cfg.conversion_date,jsonb_build_object('convert_date',cfg.conversion_date,'launch',cfg.first_visit_date),_at); n:=n+1;
   END IF;
  END LOOP;
 END IF;
 FOR v IN SELECT * FROM visits WHERE visit_date=d+1 AND status::text='scheduled' AND NOT is_sample LOOP
  PERFORM lifecycle_emit_user(v.user_id,'VISIT_REMINDER','visit:'||v.id||':reminder',jsonb_build_object('visit_id',v.id,'service',v.service_type,'time_window',v.time_window,'pro_name',coalesce(v.crew_name,'Your Tidy Pro')),(d+time '17:00') AT TIME ZONE 'America/New_York');
 END LOOP;
 FOR s IN SELECT * FROM subscriptions WHERE status::text='active' LOOP
  IF extract(day FROM d)=1 AND coalesce(s.free_addons_per_month,0)>0 THEN PERFORM lifecycle_emit_user(s.user_id,'BUNDLE_GIFT','gift:'||s.user_id||':'||to_char(d,'YYYY-MM'),'{}',_at); END IF;
  IF extract(isodow FROM d)=1 AND extract(day FROM d)<=7 THEN PERFORM lifecycle_emit_user(s.user_id,'MONTHLY_EMAIL','monthly:'||s.user_id||':'||to_char(d,'YYYY-MM'),jsonb_build_object('plan',array_to_string(s.services,' + '),'price_month','$'||s.monthly_total_cents/100.0),_at); END IF;
  IF d>=s.created_at::date+interval '3 months' AND d<s.created_at::date+interval '3 months 1 day' THEN PERFORM lifecycle_emit_user(s.user_id,'ANNIVERSARY_3M','anniversary:'||s.user_id||':3', '{}' ,_at); END IF;
  IF d>=s.created_at::date+interval '6 months' AND d<s.created_at::date+interval '6 months 1 day' THEN PERFORM lifecycle_emit_user(s.user_id,'ANNIVERSARY_6M','anniversary:'||s.user_id||':6','{}',_at); END IF;
  IF s.card_exp_month BETWEEN 1 AND 12 AND s.card_exp_year IS NOT NULL THEN
   expiry:=(make_date(s.card_exp_year,s.card_exp_month,1)+interval '1 month - 1 day')::date;
   IF expiry-d IN (30,7) THEN PERFORM lifecycle_emit_user(s.user_id,'CARD_EXPIRING_'||(expiry-d),'card:'||s.id||':'||expiry||':'||(expiry-d),jsonb_build_object('deadline',expiry),_at); END IF;
  END IF;
  IF (SELECT count(*) FROM visits WHERE user_id=s.user_id AND status::text='skipped' AND visit_date>=d-60)>=2 THEN
   PERFORM lifecycle_emit_user(s.user_id,'SKIP_PATTERN','skip-pattern:'||s.user_id||':'||to_char(d,'YYYY-MM'),'{}',_at);
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'date',d,'converting',n);
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_daily_events(timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_daily_events(timestamptz) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.lifecycle_simulate(_contact_id uuid,_event text DEFAULT NULL,_journey boolean DEFAULT false,_tokens jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contacts; sid uuid:=gen_random_uuid(); timeline jsonb:='[]'; out jsonb; ev text; i integer:=0; at_time timestamptz:=now(); oldstage text; oldentered timestamptz; oldwelcome timestamptz; duplicate_ok boolean; orphan_count integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO c FROM contacts WHERE id=_contact_id AND is_test FOR UPDATE;
 IF c.id IS NULL THEN RAISE EXCEPTION 'choose an is_test contact'; END IF;
 oldstage:=c.lifecycle_stage; oldentered:=c.stage_entered_at; oldwelcome:=c.welcome_at;
 IF _journey THEN
  UPDATE contacts SET lifecycle_stage='PRICE_SEEN',welcome_at=NULL WHERE id=c.id;
  FOREACH ev IN ARRAY ARRAY['PRICE_SEEN','RESERVED','CONVERTING','PAID','PRO_ASSIGNED','VISIT_REMINDER','ON_THE_WAY','ARRIVED','VISIT_COMPLETE','RATING_LOW','FIX','VISIT_COMPLETE','REVIEW','VISIT_COMPLETE','REFERRAL','PAYMENT_FAILED','RECOVERED','PAUSED','CANCELLED','WINBACK_30','WINBACK_90','COLD','COLD_45','COLD_90'] LOOP
   i:=i+1;
   at_time:=now()+make_interval(mins=>i*5);
   out:=lifecycle_dispatch_internal(c.id,ev,'simulation:'||sid||':'||i,_tokens||jsonb_build_object('visit_id','test-visit-'||i,'rating',2),at_time,sid);
   timeline:=timeline||jsonb_build_array(out);
  END LOOP;
 ELSE
  out:=lifecycle_dispatch_internal(c.id,_event,'simulation:'||sid||':1',_tokens,at_time,sid); timeline:=jsonb_build_array(out);
 END IF;
 out:=lifecycle_dispatch_internal(c.id,coalesce(_event,'PRICE_SEEN'),'simulation:'||sid||':1',_tokens,at_time,sid);
 duplicate_ok:=(out->>'duplicate')::boolean;
 SELECT count(*) INTO orphan_count FROM contacts x WHERE x.id=c.id AND NOT EXISTS(SELECT 1 FROM message_queue q WHERE q.contact_id=x.id AND q.status='queued' AND q.queue_scope='stage');
 UPDATE message_queue SET status='dry_run',sent_at=now() WHERE simulation_id=sid AND status='queued';
 UPDATE contacts SET lifecycle_stage=oldstage,stage_entered_at=oldentered,welcome_at=oldwelcome WHERE id=c.id;
 RETURN jsonb_build_object('simulation_id',sid,'shadow',true,'timeline',timeline,'duplicate_protection',duplicate_ok,'orphans',orphan_count,'messages',(SELECT count(*) FROM message_queue WHERE simulation_id=sid));
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_simulate(uuid,text,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.lifecycle_simulate(uuid,text,boolean,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.lifecycle_capture_trigger_safe() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END $$;
CREATE INDEX IF NOT EXISTS visits_member_lifecycle_idx ON public.visits(user_id,visit_date,status);
CREATE INDEX IF NOT EXISTS invoices_member_lifecycle_idx ON public.invoices(user_id,status);