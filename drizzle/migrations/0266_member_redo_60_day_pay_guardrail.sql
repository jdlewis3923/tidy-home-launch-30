CREATE TABLE public.redo_pay_decisions (redo_id uuid PRIMARY KEY REFERENCES public.redo_requests(id) ON DELETE CASCADE, visit_id uuid UNIQUE NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE, member_id uuid NOT NULL, pro_id uuid NOT NULL, paid boolean NOT NULL, original_rate_cents integer NOT NULL, amount_cents integer NOT NULL, reason text NOT NULL, label text NOT NULL, decided_at timestamptz NOT NULL, last_paid_redo_at timestamptz, credited_at timestamptz, is_test boolean NOT NULL DEFAULT false);
GRANT SELECT ON public.redo_pay_decisions TO authenticated;
GRANT ALL ON public.redo_pay_decisions TO service_role;
ALTER TABLE public.redo_pay_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY redo_pay_private_read ON public.redo_pay_decisions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR pro_id=auth.uid());
CREATE INDEX redo_pay_member_paid_idx ON public.redo_pay_decisions(member_id,decided_at) WHERE paid;
CREATE OR REPLACE FUNCTION public.redo_pay_eligible(_member uuid, _at timestamptz, _test boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT NOT EXISTS(SELECT 1 FROM public.redo_pay_decisions WHERE member_id=_member AND paid AND is_test=_test AND decided_at > _at-interval '60 days' AND decided_at <= _at) $$;
REVOKE ALL ON FUNCTION public.redo_pay_eligible(uuid,timestamptz,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.redo_pay_eligible(uuid,timestamptz,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.redo_completion_pay_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.redo_requests; orig public.visits; last_paid timestamptz; original_rate integer; amount integer; at_time timestamptz; eligible boolean; decision public.redo_pay_decisions;
BEGIN
 IF NOT coalesce(NEW.is_redo,false) OR NEW.status::text<>'complete' OR OLD.status::text='complete' THEN RETURN NEW; END IF;
 IF NEW.redo_request_id IS NULL OR NEW.assigned_pro_id IS NULL OR NEW.user_id IS NULL THEN RAISE EXCEPTION 'redo_request_member_and_pro_required'; END IF;
 at_time:=coalesce(NEW.completed_at,now());
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text||':redo-pay:'||coalesce(NEW.is_sample,false)::text,0));
 SELECT * INTO r FROM public.redo_requests WHERE id=NEW.redo_request_id FOR UPDATE;
 IF NOT FOUND OR r.user_id IS DISTINCT FROM NEW.user_id OR r.status='canceled' OR (r.redo_visit_id IS NOT NULL AND r.redo_visit_id<>NEW.id) THEN RAISE EXCEPTION 'redo_request_mismatch'; END IF;
 SELECT * INTO orig FROM public.visits WHERE id=r.visit_id;
 IF orig.user_id IS DISTINCT FROM NEW.user_id OR coalesce(orig.is_redo,false) OR orig.status::text<>'complete' THEN RAISE EXCEPTION 'redo_original_visit_required'; END IF;
 SELECT * INTO decision FROM public.redo_pay_decisions WHERE redo_id=r.id;
 IF FOUND THEN NEW.contractor_pay_cents:=decision.amount_cents; NEW.visit_pay_cents:=decision.amount_cents; RETURN NEW; END IF;
 SELECT max(decided_at) INTO last_paid FROM public.redo_pay_decisions WHERE member_id=NEW.user_id AND paid AND is_test=coalesce(NEW.is_sample,false) AND decided_at>at_time-interval '60 days' AND decided_at<=at_time;
 original_rate:=coalesce(orig.visit_pay_cents,orig.contractor_pay_cents,0);
 IF original_rate<=0 THEN RAISE EXCEPTION 'redo_original_rate_missing'; END IF;
 IF orig.cleaning_team_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.cleaning_teams WHERE id=orig.cleaning_team_id AND kind='paired_pros') THEN
   SELECT coalesce((SELECT sum(amount_cents)::integer FROM public.cleaning_pay_lines WHERE visit_id=orig.id AND pro_id=coalesce(r.responsible_pro_id,NEW.assigned_pro_id)),original_rate/2) INTO original_rate;
 END IF;
 eligible:=last_paid IS NULL; amount:=CASE WHEN eligible THEN round(original_rate/2.0)::integer ELSE 0 END;
 INSERT INTO public.redo_pay_decisions(redo_id,visit_id,member_id,pro_id,paid,original_rate_cents,amount_cents,reason,label,decided_at,last_paid_redo_at,is_test) VALUES(r.id,NEW.id,NEW.user_id,NEW.assigned_pro_id,eligible,original_rate,amount,CASE WHEN eligible THEN 'No paid redo for this member in the preceding 60 days' ELSE 'Paid redo for this member within 60 days' END,CASE WHEN eligible THEN 'Redo — 50% of original visit rate' ELSE 'Redo — unpaid (2nd within 60 days)' END,at_time,last_paid,coalesce(NEW.is_sample,false));
 NEW.completed_at:=at_time; NEW.contractor_pay_cents:=amount; NEW.visit_pay_cents:=amount;
 RETURN NEW;
END $$;
CREATE TRIGGER zzzz_redo_completion_pay_guard BEFORE UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.redo_completion_pay_guard();
CREATE OR REPLACE FUNCTION public.redo_credit_on_close() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.redo_pay_decisions; nm text; es boolean;
BEGIN
 IF NOT coalesce(NEW.is_redo,false) OR NEW.status::text<>'complete' OR OLD.status::text='complete' THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.redo_pay_decisions WHERE visit_id=NEW.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'redo_pay_decision_missing'; END IF;
 IF d.credited_at IS NOT NULL THEN RETURN NEW; END IF;
 IF NEW.service::text='cleaning' THEN INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(NEW.id,d.pro_id,'redo',d.amount_cents,'redo:'||d.redo_id) ON CONFLICT(dedupe_key) DO NOTHING; END IF;
 IF NOT d.is_test THEN PERFORM public.credit_payout_week(d.pro_id,NEW.completed_at,d.amount_cents); END IF;
 UPDATE public.redo_pay_decisions SET credited_at=now() WHERE redo_id=d.redo_id;
 UPDATE public.redo_requests SET status='completed',resolved_at=NEW.completed_at WHERE id=d.redo_id;
 IF NOT d.paid THEN
  SELECT coalesce(customer_first_name,'Member') INTO nm FROM public.visits WHERE id=NEW.id;
  INSERT INTO public.admin_alerts(alert_type,level,category,title,body,action_label,action_url,dedupe_key,context) VALUES('redo_unpaid','critical','operations','Redo — unpaid (2nd within 60 days)',nm||': a paid redo occurred within 60 days. This required return pays $0; the member is never charged.','Open redos','/admin/command#redos','redo-unpaid:'||d.redo_id,jsonb_build_object('redo_id',d.redo_id,'visit_id',NEW.id,'member_id',d.member_id,'last_paid_redo_at',d.last_paid_redo_at,'is_test',d.is_test)) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 IF NOT d.is_test THEN
  es:=public.user_lang(d.pro_id)='es';
  INSERT INTO public.pro_notifications(pro_id,kind,title,body,related_visit_id) VALUES(d.pro_id,'redo',CASE WHEN es THEN 'Regreso completado' ELSE 'Redo completed' END,CASE WHEN es THEN CASE WHEN d.paid THEN 'Regreso pagado al 50% de la tarifa de la visita original. Un regreso pagado por miembro cada 60 días.' ELSE 'Regreso sin pago (segundo en 60 días). El regreso es obligatorio; el miembro nunca paga.' END ELSE CASE WHEN d.paid THEN 'Redo paid at 50% of the original visit rate. One paid redo per member every 60 days.' ELSE 'Redo — unpaid (2nd within 60 days). The return is required; the member is never charged.' END END,NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zzzzz_redo_credit_on_close AFTER UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.redo_credit_on_close();
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef('public.cleaning_record_pay(uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;','IF coalesce(v.is_redo,false) THEN RETURN coalesce(v.visit_pay_cents,0); END IF; SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;');
 EXECUTE definition;
 SELECT pg_get_functiondef('public.cleaning_pro_visit_pay(uuid,uuid)'::regprocedure) INTO definition;
 definition:=replace(definition,'IF v.service::text <> ''cleaning'' THEN RETURN v.visit_pay_cents; END IF;','IF v.service::text <> ''cleaning'' THEN RETURN v.visit_pay_cents; END IF; IF coalesce(v.is_redo,false) AND v.completed_at IS NOT NULL THEN RETURN coalesce((SELECT amount_cents FROM public.redo_pay_decisions WHERE visit_id=v.id AND pro_id=_pro),0); END IF;');
 EXECUTE definition;
END $$;
COMMENT ON COLUMN public.visits.is_redo IS 'Free 48-hour member return; on completion one paid redo per member per rolling 60 days at 50% of original Pro rate, further required redos pay zero. No advancement counts.';