CREATE OR REPLACE FUNCTION public.lifecycle_daily_events(_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 FOR v IN SELECT * FROM visits WHERE visit_date=d+1 AND status::text='scheduled' AND NOT is_sample AND (subscription_id IS NULL OR NOT public.subscription_jobber_owned(subscription_id)) LOOP
  PERFORM lifecycle_emit_user(v.user_id,'VISIT_REMINDER','visit:'||v.id||':reminder',jsonb_build_object('visit_id',v.id,'service',v.service_type,'time_window',v.time_window,'pro_name',coalesce(v.crew_name,'Your Tidy Pro')),(d+time '17:00') AT TIME ZONE 'America/New_York');
 END LOOP;
 -- Jobber-owned plans: reminders come from the Jobber mirror only.
 FOR v IN SELECT * FROM jobber_visits WHERE (start_at AT TIME ZONE 'America/New_York')::date=d+1 AND deleted_at IS NULL AND customer_skipped_at IS NULL AND status IS DISTINCT FROM 'complete' AND NOT is_test AND user_id IS NOT NULL LOOP
  PERFORM lifecycle_emit_user(v.user_id,'VISIT_REMINDER','jvisit:'||v.id||':reminder',jsonb_build_object('visit_id',v.id,'service',v.service_line,'time_window',to_char(v.start_at AT TIME ZONE 'America/New_York','FMHH12:MI AM')||' – '||to_char(v.end_at AT TIME ZONE 'America/New_York','FMHH12:MI AM'),'pro_name','Your Tidy Pro'),(d+time '17:00') AT TIME ZONE 'America/New_York');
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
  IF (SELECT count(*) FROM visits WHERE user_id=s.user_id AND status::text='skipped' AND visit_date>=d-60)+(SELECT count(*) FROM jobber_visits WHERE user_id=s.user_id AND customer_skipped_at IS NOT NULL AND start_at>=(d-60))>=2 THEN
   PERFORM lifecycle_emit_user(s.user_id,'SKIP_PATTERN','skip-pattern:'||s.user_id||':'||to_char(d,'YYYY-MM'),'{}',_at);
  END IF;
 END LOOP;

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
 RETURN jsonb_build_object('ok',true,'date',d,'converting',n);
END $function$;