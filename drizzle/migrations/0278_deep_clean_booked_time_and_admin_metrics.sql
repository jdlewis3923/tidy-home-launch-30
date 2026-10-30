CREATE OR REPLACE FUNCTION public.deep_clean_booked_time() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE mins integer; mult integer;
BEGIN
 IF NEW.addon_key='deep_clean' AND NEW.status='pending_visit' THEN
 SELECT (a.added_minutes->>v.size_tier::text)::integer,CASE WHEN v.size_tier=5 THEN 2 ELSE 1 END INTO mins,mult FROM public.visits v CROSS JOIN public.addon_catalog a WHERE v.id=NEW.visit_id AND a.addon_key='deep_clean';
 IF mins IS NULL THEN RAISE EXCEPTION 'verified_visit_size_required'; END IF;
 PERFORM public.deep_clean_capacity_check(NEW.visit_id,mins);
 UPDATE public.visits SET budget_hours=coalesce(budget_hours,0)+mins::numeric/60*mult,scheduled_end=scheduled_end+make_interval(mins=>mins) WHERE id=NEW.visit_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER deep_clean_booked_time BEFORE INSERT ON public.addon_attaches FOR EACH ROW EXECUTE FUNCTION public.deep_clean_booked_time();
CREATE OR REPLACE FUNCTION public.admin_deep_clean_metrics() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT jsonb_build_object('bookings',count(*),'revenue_cents',coalesce(sum(a.addon_price_cents),0),'first_visit_bookings',count(*) FILTER(WHERE v.cleaning_first_visit)) INTO result FROM public.addon_attaches a JOIN public.visits v ON v.id=a.visit_id WHERE a.addon_key='deep_clean' AND a.status IN ('pending_visit','completed') AND NOT coalesce(v.is_sample,false);
 RETURN result||jsonb_build_object('by_size_zip',coalesce((SELECT jsonb_agg(x) FROM(SELECT v.size_tier,v.zip,count(DISTINCT a.id) AS bookings,coalesce(sum(a.addon_price_cents),0) AS revenue_cents FROM public.addon_attaches a JOIN public.visits v ON v.id=a.visit_id WHERE a.addon_key='deep_clean' AND a.status IN ('pending_visit','completed') AND NOT coalesce(v.is_sample,false) GROUP BY v.size_tier,v.zip)x),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.admin_deep_clean_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_deep_clean_metrics() TO authenticated,service_role;