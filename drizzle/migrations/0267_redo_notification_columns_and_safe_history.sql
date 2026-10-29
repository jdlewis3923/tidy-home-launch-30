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
  nm:=coalesce(NEW.customer_first_name,'Member');
  INSERT INTO public.admin_alerts(alert_type,level,category,title,body,action_label,action_url,dedupe_key,context) VALUES('redo_unpaid','critical','operations','Redo — unpaid (2nd within 60 days)',nm||': a paid redo occurred within 60 days. This required return pays $0; the member is never charged.','Open redos','/admin/command#redos','redo-unpaid:'||d.redo_id,jsonb_build_object('redo_id',d.redo_id,'visit_id',NEW.id,'member_id',d.member_id,'last_paid_redo_at',d.last_paid_redo_at,'is_test',d.is_test)) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 IF NOT d.is_test THEN
  es:=public.user_lang(d.pro_id)='es';
  INSERT INTO public.pro_notifications(contractor_id,kind,title,body,url,context) VALUES(d.pro_id,'redo',CASE WHEN es THEN 'Regreso completado' ELSE 'Redo completed' END,CASE WHEN es THEN CASE WHEN d.paid THEN 'Regreso pagado al 50% de la tarifa de la visita original. Un regreso pagado por miembro cada 60 días.' ELSE 'Regreso sin pago (segundo en 60 días). El regreso es obligatorio; el miembro nunca paga.' END ELSE CASE WHEN d.paid THEN 'Redo paid at 50% of the original visit rate. One paid redo per member every 60 days.' ELSE 'Redo — unpaid (2nd within 60 days). The return is required; the member is never charged.' END END,'/pro/visit/'||NEW.id,jsonb_build_object('visit_id',NEW.id,'redo_id',d.redo_id));
 END IF;
 RETURN NEW;
END $$;