CREATE OR REPLACE FUNCTION public.cleaning_pay_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_visit boolean;
BEGIN
 IF NEW.service::text<>'cleaning' OR NEW.size_tier IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.completed_at IS NOT NULL OR OLD.status::text IN ('complete','blocked') THEN RETURN NEW; END IF; END IF;
 IF NEW.size_tier>=4 THEN
 PERFORM pg_advisory_xact_lock(hashtext(coalesce(NEW.user_id::text,NEW.subscription_id::text)));
 SELECT NOT EXISTS(SELECT 1 FROM public.visits WHERE user_id=NEW.user_id AND service::text='cleaning' AND NOT is_redo AND id<>NEW.id AND (completed_at IS NOT NULL OR visit_date<NEW.visit_date)) INTO first_visit;
 NEW.cleaning_first_visit:=first_visit AND NOT NEW.is_redo;
 END IF;
 NEW.contractor_pay_cents:=public.contractor_visit_pay_cents('cleaning',NEW.size_tier,'monthly',NULL,false,NULL);
 IF NEW.cleaning_first_visit THEN NEW.contractor_pay_cents:=NEW.contractor_pay_cents*3/2; END IF;
 IF NEW.is_redo OR NEW.status::text='blocked' THEN NEW.contractor_pay_cents:=public.contractor_visit_pay_cents('cleaning',NEW.size_tier,'monthly',NULL,false,NULL)/2; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zy_cleaning_pay_snapshot BEFORE INSERT OR UPDATE OF status,assigned_pro_id,contractor_pay_cents ON public.visits FOR EACH ROW EXECUTE FUNCTION public.cleaning_pay_snapshot();
CREATE OR REPLACE FUNCTION public.cleaning_record_pay(_visit uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; p uuid; share integer; total integer:=0; amount integer; inserted uuid;
BEGIN
 IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
 IF v.service::text<>'cleaning' OR v.status::text NOT IN ('complete','blocked') THEN RAISE EXCEPTION 'cleaning_visit_not_finished'; END IF;
 SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;
 share:=CASE WHEN v.size_tier=5 AND t.kind='paired_pros' THEN 2 ELSE 1 END;
 FOR p IN SELECT v.assigned_pro_id UNION SELECT t.partner_pro_id WHERE share=2 LOOP
 amount:=coalesce(public.pro_tier_uplift_cents(v.contractor_pay_cents,p),v.contractor_pay_cents)/share;
 inserted:=NULL;
 INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,CASE WHEN v.is_redo THEN 'redo' ELSE 'base' END,amount,'cleaning_visit:'||v.id||':'||p) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO inserted;
 IF inserted IS NOT NULL THEN
 PERFORM public.credit_payout_week(p,coalesce(v.completed_at,now()),amount);
 IF NOT v.is_redo AND v.status::text='complete' THEN UPDATE public.applicants SET completed_visits=coalesce(completed_visits,0)+1,last_visit_at=now() WHERE contractor_id=p; END IF;
 total:=total+amount;
 END IF;
 END LOOP;
 RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.cleaning_record_pay(uuid) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.cleaning_record_pay(uuid) TO service_role;