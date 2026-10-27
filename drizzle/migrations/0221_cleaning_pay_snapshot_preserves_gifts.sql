ALTER TABLE public.visits ADD COLUMN cleaning_base_pay_cents integer;
ALTER TABLE public.size_reviews ADD COLUMN observed_sq_ft integer;
CREATE OR REPLACE FUNCTION public.cleaning_pay_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE extra integer; base integer;
BEGIN
 IF NEW.service::text<>'cleaning' OR NEW.size_tier IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
   IF OLD.completed_at IS NOT NULL OR OLD.status::text IN ('complete','blocked') THEN RETURN NEW; END IF;
   NEW.cleaning_first_visit:=OLD.cleaning_first_visit;
 END IF;
 IF TG_OP='INSERT' AND NEW.size_tier>=4 THEN
   PERFORM pg_advisory_xact_lock(hashtext(coalesce(NEW.user_id::text,NEW.subscription_id::text)));
   SELECT NOT EXISTS(SELECT 1 FROM public.visits WHERE user_id=NEW.user_id AND service::text='cleaning' AND NOT coalesce(is_redo,false) AND id<>NEW.id AND status::text NOT IN ('canceled','skipped') AND visit_date<=NEW.visit_date) INTO NEW.cleaning_first_visit;
   NEW.cleaning_first_visit:=NEW.cleaning_first_visit AND NOT coalesce(NEW.is_redo,false);
 END IF;
 base:=public.contractor_visit_pay_cents('cleaning',NEW.size_tier,'monthly',NULL,false,NULL);
 NEW.cleaning_base_pay_cents:=coalesce(NEW.cleaning_base_pay_cents,base);
 base:=NEW.cleaning_base_pay_cents;
 IF NEW.cleaning_first_visit THEN base:=base*3/2; END IF;
 IF coalesce(NEW.is_redo,false) OR NEW.status::text='blocked' THEN base:=NEW.cleaning_base_pay_cents/2; END IF;
 SELECT coalesce(sum(contractor_pay_cents),0)::integer INTO extra FROM public.addon_attaches WHERE visit_id=NEW.id AND status IN ('pending_visit','completed');
 NEW.contractor_pay_cents:=base+CASE WHEN NEW.status::text='blocked' OR coalesce(NEW.is_redo,false) THEN 0 ELSE extra END;
 NEW.visit_pay_cents:=public.pro_tier_uplift_cents(NEW.contractor_pay_cents,NEW.assigned_pro_id);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.cleaning_record_pay(_visit uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; p uuid; share integer; total integer:=0; amount integer; inserted uuid; base integer; premium integer; partial integer; addon integer; paid integer;
BEGIN
 IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
 IF NOT FOUND OR v.service::text IS DISTINCT FROM 'cleaning' OR v.status::text NOT IN ('complete','blocked') OR v.assigned_pro_id IS NULL THEN RAISE EXCEPTION 'cleaning_visit_not_finished'; END IF;
 SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;
 share:=CASE WHEN v.size_tier=5 AND t.kind='paired_pros' THEN 2 ELSE 1 END;
 base:=coalesce(v.cleaning_base_pay_cents,public.contractor_visit_pay_cents('cleaning',v.size_tier,'monthly',NULL,false,NULL));
 premium:=CASE WHEN v.cleaning_first_visit AND v.status::text='complete' AND NOT coalesce(v.is_redo,false) THEN base/2 ELSE 0 END;
 partial:=CASE WHEN coalesce(v.is_redo,false) OR v.status::text='blocked' THEN -base/2 ELSE 0 END;
 SELECT coalesce(sum(contractor_pay_cents),0)::integer INTO addon FROM public.addon_attaches WHERE visit_id=v.id AND status='completed';
 IF v.status::text='blocked' OR coalesce(v.is_redo,false) THEN addon:=0; END IF;
 FOR p IN SELECT v.assigned_pro_id UNION SELECT t.partner_pro_id WHERE share=2 LOOP
   inserted:=NULL;
   paid:=coalesce(public.pro_tier_uplift_cents(base+premium+partial,p),base+premium+partial)/share;
   amount:=base/share;
   INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,CASE WHEN v.is_redo THEN 'redo' ELSE 'base' END,amount,'cleaning_visit:'||v.id||':'||p) ON CONFLICT(dedupe_key) DO NOTHING RETURNING id INTO inserted;
   IF inserted IS NOT NULL THEN
     IF premium>0 THEN INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,'first_visit',premium/share,'cleaning_first:'||v.id||':'||p); END IF;
     IF partial<0 THEN INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,'partial',partial/share,'cleaning_partial:'||v.id||':'||p); END IF;
     IF paid<>(base+premium+partial)/share THEN INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,'base',paid-(base+premium+partial)/share,'cleaning_tier:'||v.id||':'||p); END IF;
     IF addon>0 AND p=v.assigned_pro_id THEN INSERT INTO public.cleaning_pay_lines(visit_id,pro_id,kind,amount_cents,dedupe_key) VALUES(v.id,p,'addon',addon,'cleaning_addon:'||v.id||':'||p); paid:=paid+addon; END IF;
     PERFORM public.credit_payout_week(p,coalesce(v.scheduled_start,v.completed_at,now()),paid);
     IF NOT coalesce(v.is_redo,false) AND v.status::text='complete' THEN UPDATE public.applicants SET completed_visits=coalesce(completed_visits,0)+1,last_visit_at=now() WHERE contractor_id=p AND NOT coalesce(is_test_row,false); END IF;
     total:=total+paid;
   END IF;
 END LOOP;
 RETURN total;
END $$;
CREATE OR REPLACE FUNCTION public.cleaning_credit_on_close() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.service::text='cleaning' AND NEW.status::text='complete' AND OLD.status::text<>'complete' THEN PERFORM public.cleaning_record_pay(NEW.id); END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_cleaning_credit_on_close AFTER UPDATE OF status ON public.visits FOR EACH ROW EXECUTE FUNCTION public.cleaning_credit_on_close();