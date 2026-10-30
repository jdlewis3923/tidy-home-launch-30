CREATE TABLE public.member_visit_checkins (visit_id uuid PRIMARY KEY REFERENCES public.visits(id) ON DELETE CASCADE, user_id uuid NOT NULL, pro_id uuid, service public.service_type NOT NULL, visit_number integer NOT NULL, release_at timestamptz NOT NULL, score integer, scored_at timestamptz, is_test boolean NOT NULL DEFAULT false);
GRANT SELECT ON public.member_visit_checkins TO authenticated;
GRANT ALL ON public.member_visit_checkins TO service_role;
ALTER TABLE public.member_visit_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_checkin_read ON public.member_visit_checkins FOR SELECT TO authenticated USING(user_id=auth.uid() OR pro_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE OR REPLACE FUNCTION public.member_checkin_send_time(_at timestamptz) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$ DECLARE t timestamp:=_at AT TIME ZONE 'America/New_York'; BEGIN
IF extract(dow from t)<>0 AND t::time >= time '08:00' AND t::time<time '18:00' THEN RETURN _at; END IF;
IF t::time>=time '18:00' THEN t:=date_trunc('day',t)+interval '1 day 8 hours'; ELSE t:=date_trunc('day',t)+interval '8 hours'; END IF;
IF extract(dow from t)=0 THEN t:=t+interval '1 day'; END IF; RETURN t AT TIME ZONE 'America/New_York'; END $$;
CREATE OR REPLACE FUNCTION public.queue_first_three_visit_checkin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; due timestamptz; msg text; lang text; BEGIN
IF NEW.status::text<>'complete' OR OLD.status::text='complete' OR NEW.is_redo THEN RETURN NEW; END IF;
PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text||':'||NEW.service::text));
SELECT count(*) INTO n FROM public.visits WHERE user_id=NEW.user_id AND service=NEW.service AND status::text='complete' AND NOT is_redo AND coalesce(is_sample,false)=coalesce(NEW.is_sample,false);
IF n>3 THEN RETURN NEW; END IF;
due:=public.member_checkin_send_time(coalesce(NEW.completed_at,now())+interval '2 hours');
INSERT INTO member_visit_checkins(visit_id,user_id,pro_id,service,visit_number,release_at,is_test) VALUES(NEW.id,NEW.user_id,NEW.assigned_pro_id,NEW.service,n,due,coalesce(NEW.is_sample,false)) ON CONFLICT DO NOTHING;
IF coalesce(NEW.is_sample,false) THEN RETURN NEW; END IF;
lang:=public.user_lang(NEW.user_id);
msg:=CASE WHEN lang='es' THEN '¿Cómo estuvo la visita de hoy? Responde del 1 al 5. ¿Algo no quedó bien? Toca aquí y volvemos en 48 horas: ' ELSE 'How did today''s visit go? Reply 1–5. Anything not right, tap here and we''ll come back within 48 hours: ' END || 'https://jointidy.co/dashboard/visit/'||NEW.id;
PERFORM public.sched_customer_sms(NEW.user_id,msg,'first-three:'||NEW.id,'first_three_checkin',due+interval '7 days');
UPDATE sms_outbox SET release_after=due,queued_reason='First-three-visit check-in: two hours after checkout; Mon–Sat 8 AM–6 PM ET' WHERE idempotency_key='sched-first-three:'||NEW.id;
RETURN NEW; END $$;
CREATE TRIGGER first_three_visit_checkin AFTER UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.queue_first_three_visit_checkin();
CREATE OR REPLACE FUNCTION public.first_three_checkin_reply(_phone text,_body text,_sid text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c public.member_visit_checkins; v public.visits; val integer; BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
IF trim(_body) !~ '^[1-5]$' THEN RETURN jsonb_build_object('handled',false); END IF;
SELECT mc.* INTO c FROM member_visit_checkins mc JOIN profiles p ON p.user_id=mc.user_id JOIN sms_outbox o ON o.idempotency_key='sched-first-three:'||mc.visit_id WHERE right(regexp_replace(p.phone,'\D','','g'),10)=right(regexp_replace(_phone,'\D','','g'),10) AND o.status='sent' AND mc.scored_at IS NULL AND NOT mc.is_test AND mc.release_at<=now() AND mc.release_at>now()-interval '7 days' ORDER BY mc.release_at DESC LIMIT 1 FOR UPDATE OF mc;
IF c.visit_id IS NULL THEN RETURN jsonb_build_object('handled',false); END IF;
val:=trim(_body)::integer; UPDATE member_visit_checkins SET score=val,scored_at=now() WHERE visit_id=c.visit_id;
INSERT INTO visit_ratings(visit_id,user_id,contractor_id,rating,stars,source,lang,raw_identifier,verified) VALUES(c.visit_id,c.user_id,c.pro_id,val,val,'sms_reply',public.user_lang(c.user_id),'sms:'||_sid,true);
IF val<=3 THEN
SELECT * INTO v FROM visits WHERE id=c.visit_id;
IF NOT EXISTS(SELECT 1 FROM redo_requests WHERE visit_id=v.id AND status<>'canceled') THEN INSERT INTO redo_requests(visit_id,user_id,pro_id,note,source,requested_at,due_at,is_test_row) VALUES(v.id,c.user_id,c.pro_id,'First-three-visit score '||val||'; contact member and arrange free return within 48 hours.','sms',now(),now()+interval '48 hours',false); END IF;
INSERT INTO admin_alerts(alert_type,level,category,title,body,action_label,action_url,dedupe_key,context) VALUES('first_three_low_score','critical','operations','Visit scored '||val||'/5 — redo follow-up','Member rated an early visit 1–3. Contact them immediately; return within 48 hours, free. / El miembro calificó una visita inicial con 1–3. Contáctalo de inmediato; regreso gratis en 48 horas.','Open redo','/admin/redos','early-score:'||c.visit_id,jsonb_build_object('visit_id',c.visit_id,'pro_id',c.pro_id,'score',val)) ON CONFLICT DO NOTHING;
END IF;
RETURN jsonb_build_object('handled',true,'score',val,'visit_id',c.visit_id); END $$;
REVOKE ALL ON FUNCTION public.first_three_checkin_reply(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.first_three_checkin_reply(text,text,text) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_estate_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb; BEGIN
IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
WITH firsts AS (SELECT DISTINCT ON(user_id,service) user_id,size_tier FROM visits WHERE status::text='complete' AND service::text='cleaning' AND NOT coalesce(is_sample,false) AND NOT is_redo ORDER BY user_id,service,completed_at,id)
SELECT jsonb_build_object('estate_homes',count(*) FILTER(WHERE size_tier=4),'estate_plus_homes',count(*) FILTER(WHERE size_tier=5),'covered_cost',coalesce(sum(CASE size_tier WHEN 4 THEN 85 WHEN 5 THEN 119 ELSE 0 END),0),'walkthrough_requests',(SELECT count(*) FROM reservations WHERE cleaning_walkthrough_slot_id IS NOT NULL AND NOT coalesce(is_test_row,false))) INTO result FROM firsts;
RETURN result; END $$;
REVOKE ALL ON FUNCTION public.admin_estate_metrics() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_estate_metrics() TO authenticated,service_role;