CREATE OR REPLACE FUNCTION public.cleaning_visit_staff_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE tid uuid; lead uuid; BEGIN
 IF NEW.service::text<>'cleaning' OR NEW.size_tier NOT IN (4,5) OR NEW.status::text IN ('canceled','skipped','complete','blocked') THEN RETURN NEW; END IF;
 IF NEW.size_tier=5 THEN
 SELECT cleaning_team_id INTO tid FROM public.subscriptions WHERE id=NEW.subscription_id;
 NEW.cleaning_team_id:=coalesce(NEW.cleaning_team_id,tid);
 IF TG_NAME='trg_visits_zb_cleaning_team' THEN
 IF NOT public.cleaning_team_valid(NEW.cleaning_team_id) THEN RAISE EXCEPTION 'estate_plus_needs_verified_team'; END IF;
 SELECT lead_pro_id INTO lead FROM public.cleaning_teams WHERE id=NEW.cleaning_team_id;
 IF NEW.assigned_pro_id IS NOT NULL AND NEW.assigned_pro_id IS DISTINCT FROM lead THEN RAISE EXCEPTION 'estate_plus_lead_required'; END IF;
 NEW.assigned_pro_id:=lead;
 END IF;
 END IF;
 IF TG_NAME='trg_visits_zb_cleaning_team' THEN
 NEW.time_window:='8–10 AM + 11 AM–1 PM';
 NEW.window_key:='morning';
 IF NEW.visit_date IS NOT NULL THEN NEW.scheduled_start:=(NEW.visit_date::timestamp+interval '8 hours') AT TIME ZONE 'America/New_York'; NEW.scheduled_end:=(NEW.visit_date::timestamp+interval '13 hours') AT TIME ZONE 'America/New_York'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_zb_cleaning_team BEFORE INSERT OR UPDATE OF assigned_pro_id,cleaning_team_id,size_tier,status,visit_date ON public.visits FOR EACH ROW EXECUTE FUNCTION public.cleaning_visit_staff_guard();
CREATE OR REPLACE FUNCTION public.sched_visit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE cap numeric; hours numeric; t public.cleaning_teams; BEGIN
 IF coalesce(NEW.is_sample,false) OR NEW.status::text IN ('canceled','skipped') THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.visit_date IS NOT DISTINCT FROM OLD.visit_date AND NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id AND NEW.budget_hours IS NOT DISTINCT FROM OLD.budget_hours AND NEW.window_key IS NOT DISTINCT FROM OLD.window_key THEN RETURN NEW; END IF;
 IF NEW.visit_date IS NOT NULL AND (TG_OP='INSERT' OR NEW.visit_date IS DISTINCT FROM OLD.visit_date) AND NEW.visit_date<public.sched_launch_date() THEN RAISE EXCEPTION 'before_launch'; END IF;
 IF NEW.booking_id IS NULL AND NEW.claim_id IS NULL THEN RETURN NEW; END IF;
 IF public.sched_dow(NEW.visit_date)=7 THEN RAISE EXCEPTION 'no_sunday'; END IF;
 IF coalesce(current_setting('tidy.capacity_override',true),'')='on' OR NEW.assigned_pro_id IS NULL THEN RETURN NEW; END IF;
 cap:=public.sched_pro_cap(NEW.assigned_pro_id,NEW.visit_date);
 hours:=coalesce(NEW.budget_hours,0);
 IF NEW.service::text='cleaning' AND NEW.size_tier=5 THEN SELECT * INTO t FROM public.cleaning_teams WHERE id=NEW.cleaning_team_id; IF t.kind='paired_pros' THEN hours:=hours/2; END IF; END IF;
 IF public.sched_booked(NEW.assigned_pro_id,NEW.visit_date,NEW.id)+hours>cap+0.0001 THEN RAISE EXCEPTION 'over_capacity'; END IF;
 IF NEW.service::text='cleaning' AND EXISTS(SELECT 1 FROM public.visits v WHERE v.assigned_pro_id=NEW.assigned_pro_id AND v.visit_date=NEW.visit_date AND v.service::text='cleaning' AND v.window_key=NEW.window_key AND v.id<>NEW.id AND v.status::text NOT IN ('canceled','skipped')) THEN RAISE EXCEPTION 'window_taken'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_zb_estate_capacity BEFORE INSERT OR UPDATE OF assigned_pro_id,visit_date,size_tier,cleaning_team_id ON public.visits FOR EACH ROW EXECUTE FUNCTION public.cleaning_estate_capacity_guard();
CREATE OR REPLACE FUNCTION public.pro_on_cleaning_team_visit(_visit uuid,_pro uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.visits v LEFT JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id WHERE v.id=_visit AND (v.assigned_pro_id=_pro OR (v.size_tier=5 AND t.kind='paired_pros' AND t.partner_pro_id=_pro AND t.active))) $$;
REVOKE ALL ON FUNCTION public.pro_on_cleaning_team_visit(uuid,uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.pro_on_cleaning_team_visit(uuid,uuid) TO authenticated,service_role;
ALTER POLICY "visit_photos own insert" ON public.visit_photos WITH CHECK(pro_id=auth.uid() AND public.pro_on_cleaning_team_visit(visit_id,auth.uid()));
ALTER POLICY "visit_photos own select" ON public.visit_photos USING(public.pro_on_cleaning_team_visit(visit_id,auth.uid()) OR public.current_user_admin());
ALTER POLICY "visit_checklist own insert" ON public.visit_checklist_items WITH CHECK(pro_id=auth.uid() AND public.pro_on_cleaning_team_visit(visit_id,auth.uid()));