DO $m$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.lifecycle_dispatch(uuid,text,text,jsonb,timestamptz,uuid)'::regprocedure) INTO def; def:=replace(def,'FUNCTION public.lifecycle_dispatch(','FUNCTION public.lifecycle_dispatch_internal('); def:=replace(def,' IF auth.role() IS DISTINCT FROM ''service_role'' AND NOT public.has_role(auth.uid(),''admin'') THEN RAISE EXCEPTION ''forbidden''; END IF;',''); EXECUTE def; END $m$;
REVOKE ALL ON FUNCTION public.lifecycle_dispatch_internal(uuid,text,text,jsonb,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_dispatch_internal(uuid,text,text,jsonb,timestamptz,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.lifecycle_dispatch(_contact_id uuid,_event text,_key text,_tokens jsonb DEFAULT '{}',_at timestamptz DEFAULT now(),_simulation_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN public.lifecycle_dispatch_internal(_contact_id,_event,_key,_tokens,_at,_simulation_id);
END $$;
CREATE OR REPLACE FUNCTION public.lifecycle_emit_user(_user_id uuid,_event text,_key text,_tokens jsonb DEFAULT '{}',_at timestamptz DEFAULT now()) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cid uuid; BEGIN
 cid:=public.lifecycle_contact_for_user(_user_id); IF cid IS NOT NULL THEN PERFORM public.lifecycle_dispatch_internal(cid,_event,_key,_tokens,_at); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.lifecycle_capture_contact(_email text,_phone text,_first text,_last text,_zip text,_lang text,_sms boolean,_test boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cid uuid; BEGIN
 SELECT id INTO cid FROM contacts WHERE (_email IS NOT NULL AND lower(email)=lower(_email)) OR (_phone IS NOT NULL AND right(regexp_replace(phone,'\D','','g'),10)=right(regexp_replace(_phone,'\D','','g'),10)) ORDER BY created_at LIMIT 1;
 IF cid IS NULL THEN INSERT INTO contacts(email,phone,first_name,last_name,zip,lang,sms_service,sms_marketing,is_test) VALUES(lower(_email),_phone,_first,_last,_zip,CASE WHEN _lang='es' THEN 'es' ELSE 'en' END,coalesce(_sms,false),false,_test) RETURNING id INTO cid;
 ELSE UPDATE contacts SET first_name=coalesce(_first,first_name),last_name=coalesce(_last,last_name),zip=coalesce(_zip,zip),sms_service=CASE WHEN _sms IS TRUE THEN true ELSE sms_service END,updated_at=now() WHERE id=cid; END IF;
 RETURN cid;
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_capture_contact(text,text,text,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_capture_contact(text,text,text,text,text,text,boolean,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.lifecycle_capture_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n jsonb:=to_jsonb(NEW); o jsonb; cid uuid; ev text; uid uuid; tk jsonb; ct integer; v public.visits; rr record;
BEGIN
 IF TG_OP='UPDATE' THEN o:=to_jsonb(OLD); ELSE o:='{}'; END IF;
 uid:=nullif(n->>'user_id','')::uuid;
 IF TG_TABLE_NAME='leads' THEN
  cid:=lifecycle_capture_contact(n->>'email',n->>'phone',n->>'first_name',n->>'last_name',n->>'zip','en',(n->>'sms_consent')::boolean);
  PERFORM lifecycle_dispatch_internal(cid,'PRICE_SEEN','lead:'||NEW.id,'{}');
 ELSIF TG_TABLE_NAME='waitlist' THEN
  cid:=lifecycle_capture_contact(n->>'email',NULL,NULL,NULL,n->>'zip','en',false);
  PERFORM lifecycle_dispatch_internal(cid,'OUT_OF_AREA','waitlist:'||NEW.id,'{}');
 ELSIF TG_TABLE_NAME='reservations' THEN
  cid:=lifecycle_capture_contact(NEW.email,NEW.phone,NEW.first_name,NEW.last_name,NEW.zip,NEW.lang,NEW.sms_consent,NEW.is_test_row);
  UPDATE contacts SET user_id=coalesce(NEW.user_id,user_id) WHERE id=cid;
  SELECT jsonb_build_object('convert_date',conversion_date,'launch',first_visit_date) INTO tk FROM launch_config WHERE scope='home';
  IF tk IS NULL THEN SELECT jsonb_build_object('convert_date',conversion_date,'launch',first_visit_date) INTO tk FROM launch_config WHERE first_visit_date IS NOT NULL ORDER BY scope LIMIT 1; END IF;
  tk:=coalesce(tk,'{}')||jsonb_build_object('founding_number',NEW.founding_number,'zip_name',NEW.zip,'plan',array_to_string(NEW.services,' + '),'price_month','$'||(NEW.monthly_cents/100.0));
  ev:=CASE WHEN NEW.custom_quote THEN 'CUSTOM_QUOTE' WHEN NEW.founding IS FALSE THEN 'FOUNDING_FULL' ELSE 'RESERVED' END;
  IF TG_OP='INSERT' OR o->>'status' IS DISTINCT FROM n->>'status' THEN PERFORM lifecycle_dispatch_internal(cid,ev,'reservation:'||NEW.id||':'||NEW.status,tk); END IF;
 ELSIF TG_TABLE_NAME='invoices' THEN
  IF NEW.status::text='failed' AND o->>'status' IS DISTINCT FROM 'failed' THEN ev:='PAYMENT_FAILED';
  ELSIF NEW.status::text='paid' AND o->>'status'='failed' THEN ev:='RECOVERED';
  ELSIF NEW.status::text='paid' AND o->>'status' IS DISTINCT FROM 'paid' THEN ev:='PAID'; END IF;
  IF ev IS NOT NULL THEN PERFORM lifecycle_emit_user(uid,ev,'invoice:'||NEW.id||':'||ev,jsonb_build_object('pay_link',coalesce(NEW.receipt_url,'https://jointidy.co/billing'))); END IF;
 ELSIF TG_TABLE_NAME='subscriptions' AND TG_OP='UPDATE' THEN
  IF NEW.status::text='canceled' AND OLD.status::text<>'canceled' THEN ev:='CANCELLED';
  ELSIF NEW.status::text='paused' AND OLD.status::text<>'paused' AND NEW.stripe_status IS DISTINCT FROM 'past_due' AND NEW.stripe_status IS DISTINCT FROM 'incomplete' AND coalesce(NEW.latest_invoice_attempt_count,0)=0 THEN ev:='PAUSED';
  ELSIF NEW.status::text='active' AND OLD.status::text='paused' AND coalesce(OLD.latest_invoice_attempt_count,0)=0 THEN ev:='RESUMED';
  ELSIF NEW.plan_lines IS DISTINCT FROM OLD.plan_lines OR NEW.car_wash_key IS DISTINCT FROM OLD.car_wash_key THEN ev:='PLAN_CHANGED'; END IF;
  IF ev IS NOT NULL THEN PERFORM lifecycle_emit_user(uid,ev,'subscription:'||NEW.id||':'||ev||':'||NEW.updated_at); END IF;
 ELSIF TG_TABLE_NAME='visits' THEN
  IF NEW.is_sample THEN RETURN NEW; END IF;
  tk:=jsonb_build_object('visit_id',NEW.id,'service',coalesce(NEW.service_type::text,NEW.service::text),'visit_date',NEW.visit_date,'time_window',NEW.time_window,'reason',coalesce(NEW.outcome_reason,NEW.lifecycle_reason,'Tidy is reviewing this visit.'),'link','https://jointidy.co/dashboard/visit/'||NEW.id,'rating_link','https://jointidy.co/rate?t='||coalesce(NEW.rate_token,''),'pro_name',coalesce(NEW.crew_name,'Your Tidy Pro'),'eta','soon');
  IF NEW.assigned_pro_id IS NOT NULL AND o->>'assigned_pro_id' IS DISTINCT FROM n->>'assigned_pro_id' THEN PERFORM lifecycle_emit_user(uid,'PRO_ASSIGNED','visit:'||NEW.id||':pro:'||NEW.assigned_pro_id,tk); END IF;
  IF TG_OP='UPDATE' THEN
   IF NEW.status::text='on_the_way' AND OLD.status::text<>'on_the_way' THEN ev:='ON_THE_WAY';
   ELSIF NEW.status::text='in_progress' AND OLD.status::text<>'in_progress' THEN ev:='ARRIVED';
   ELSIF NEW.status::text='complete' AND OLD.status::text<>'complete' THEN ev:='VISIT_COMPLETE';
   ELSIF NEW.status::text='skipped' AND OLD.status::text<>'skipped' THEN ev:='CUSTOMER_SKIPPED';
   ELSIF NEW.status::text='canceled' AND OLD.status::text<>'canceled' THEN ev:=CASE WHEN NEW.lifecycle_reason IN ('customer_skip','skip') THEN 'CUSTOMER_SKIPPED' WHEN NEW.lifecycle_reason='day_changed' THEN NULL WHEN NEW.lifecycle_reason ILIKE '%weather%' THEN 'WEATHER' ELSE 'TIDY_CANCELLED' END;
   ELSIF NEW.visit_outcome IS DISTINCT FROM OLD.visit_outcome AND NEW.visit_outcome IS NOT NULL THEN ev:=CASE WHEN NEW.visit_outcome ILIKE '%access%' THEN 'ACCESS_ISSUE' WHEN NEW.visit_outcome ILIKE '%safety%' THEN 'SAFETY_HOLD' WHEN NEW.visit_outcome ILIKE '%scope%' THEN 'SCOPE_MISMATCH' ELSE 'NO_SHOW' END; END IF;
   IF ev IS NOT NULL THEN PERFORM lifecycle_emit_user(uid,ev,'visit:'||NEW.id||':'||ev,tk); END IF;
   IF ev='VISIT_COMPLETE' AND NOT NEW.is_redo THEN
    SELECT count(*) INTO ct FROM visits WHERE user_id=uid AND status::text='complete' AND NOT is_sample AND NOT is_redo;
    IF ct=2 THEN PERFORM lifecycle_emit_user(uid,'REVIEW','member:'||uid||':visit2',tk); END IF;
    IF ct=3 THEN PERFORM lifecycle_emit_user(uid,'REFERRAL','member:'||uid||':visit3',tk,now()+interval '7 days'); END IF;
   END IF;
  END IF;
 ELSIF TG_TABLE_NAME='visit_ratings' THEN
  IF NEW.visit_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v FROM visits WHERE id=NEW.visit_id;
  IF v.user_id IS NOT NULL AND NOT v.is_sample THEN
   ev:=CASE WHEN coalesce(NEW.stars,NEW.rating)<=3 THEN 'RATING_LOW' ELSE 'RATING_GOOD' END;
   PERFORM lifecycle_emit_user(v.user_id,ev,'rating:'||NEW.id,jsonb_build_object('visit_id',v.id,'rating',coalesce(NEW.stars,NEW.rating)));
  END IF;
 ELSIF TG_TABLE_NAME='visit_moves' THEN
  SELECT * INTO v FROM visits WHERE id=NEW.visit_id;
  ev:=CASE WHEN public.has_role(auth.uid(),'admin') OR auth.role()='service_role' THEN CASE WHEN NEW.reason ILIKE '%weather%' THEN 'WEATHER' ELSE 'TIDY_RESCHEDULED' END ELSE 'CUSTOMER_RESCHEDULED' END;
  PERFORM lifecycle_emit_user(v.user_id,ev,'move:'||NEW.id,jsonb_build_object('visit_date',NEW.to_date,'time_window',v.time_window,'service',v.service_type,'reason',NEW.reason));
 ELSIF TG_TABLE_NAME='addon_requests' THEN
  PERFORM lifecycle_emit_user(NEW.customer_id,'ADDON_REQUESTED','addon:'||NEW.id,jsonb_build_object('addon_name',NEW.addon_name));
 ELSIF TG_TABLE_NAME='referrals' AND NEW.credited_at IS NOT NULL AND o->>'credited_at' IS NULL THEN
  PERFORM lifecycle_emit_user(NEW.referrer_user_id,'REFERRAL_CREDIT','referral:'||NEW.id||':credit',jsonb_build_object('credit_cents',NEW.credit_cents));
  PERFORM lifecycle_emit_user(NEW.referred_user_id,'REFERRAL_FRIEND','referral:'||NEW.id||':friend');
 ELSIF TG_TABLE_NAME='member_notifications' THEN
  ev:=CASE WHEN NEW.kind ILIKE '%overflow%' THEN 'OVERFLOW' WHEN NEW.kind ILIKE '%weather%' THEN 'WEATHER' WHEN NEW.kind ILIKE '%safety%' THEN 'SAFETY_HOLD' WHEN NEW.kind ILIKE '%no_show%' THEN 'NO_SHOW' ELSE NULL END;
  IF ev IS NOT NULL THEN PERFORM lifecycle_emit_user(uid,ev,'notice:'||NEW.id,jsonb_build_object('reason',NEW.body)); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lifecycle_capture_leads AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_waitlist AFTER INSERT ON public.waitlist FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_reservations AFTER INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_invoices AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_subscriptions AFTER UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_visits AFTER INSERT OR UPDATE ON public.visits FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_ratings AFTER INSERT ON public.visit_ratings FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_moves AFTER INSERT ON public.visit_moves FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_addon AFTER INSERT ON public.addon_requests FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_referral AFTER UPDATE ON public.referrals FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();
CREATE TRIGGER lifecycle_capture_member_notice AFTER INSERT ON public.member_notifications FOR EACH ROW EXECUTE FUNCTION public.lifecycle_capture_trigger();