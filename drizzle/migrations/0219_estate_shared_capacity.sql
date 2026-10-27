CREATE OR REPLACE FUNCTION public.sched_booked(_pro uuid,_d date,_excl uuid) RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(sum(CASE WHEN v.size_tier=5 AND t.kind='paired_pros' THEN coalesce(v.budget_hours,0)/2 ELSE coalesce(v.budget_hours,0) END),0) FROM public.visits v LEFT JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id WHERE (v.assigned_pro_id=_pro OR t.partner_pro_id=_pro) AND v.visit_date=_d AND v.status::text NOT IN ('canceled','skipped') AND v.id IS DISTINCT FROM _excl $$;
CREATE OR REPLACE FUNCTION public.cleaning_estate_capacity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE t public.cleaning_teams; p uuid; other public.visits; hours numeric;
BEGIN
 IF NEW.service::text<>'cleaning' OR NEW.assigned_pro_id IS NULL OR NEW.status::text IN ('canceled','skipped','blocked','complete') THEN RETURN NEW; END IF;
 SELECT * INTO t FROM public.cleaning_teams WHERE id=NEW.cleaning_team_id;
 hours:=coalesce(NEW.budget_hours,0);
 IF NEW.size_tier=5 AND t.kind='paired_pros' THEN hours:=hours/2; END IF;
 FOR p IN SELECT NEW.assigned_pro_id UNION SELECT t.partner_pro_id WHERE t.partner_pro_id IS NOT NULL LOOP
 PERFORM pg_advisory_xact_lock(hashtext(p::text||NEW.visit_date::text));
 IF NEW.size_tier=5 AND public.sched_booked(p,NEW.visit_date,NEW.id)+hours>public.sched_pro_cap(p,NEW.visit_date)+0.0001 THEN RAISE EXCEPTION 'team_over_capacity'; END IF;
 FOR other IN SELECT v.* FROM public.visits v LEFT JOIN public.cleaning_teams ct ON ct.id=v.cleaning_team_id WHERE (v.assigned_pro_id=p OR ct.partner_pro_id=p) AND v.visit_date=NEW.visit_date AND v.service::text='cleaning' AND v.id<>NEW.id AND v.status::text NOT IN ('canceled','skipped','blocked') LOOP
 IF (NEW.size_tier>=4 AND (other.window_key IS DISTINCT FROM 'afternoon' OR other.size_tier>2)) OR (other.size_tier>=4 AND (NEW.window_key IS DISTINCT FROM 'afternoon' OR NEW.size_tier>2)) THEN RAISE EXCEPTION 'estate_requires_both_windows'; END IF;
 END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER cleaning_estate_capacity_guard BEFORE INSERT OR UPDATE OF assigned_pro_id,visit_date,size_tier,cleaning_team_id ON public.visits FOR EACH ROW EXECUTE FUNCTION public.cleaning_estate_capacity_guard();