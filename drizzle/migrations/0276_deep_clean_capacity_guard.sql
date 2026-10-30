CREATE OR REPLACE FUNCTION public.deep_clean_capacity_check(_visit uuid,_minutes integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; p uuid; extra numeric; share numeric;
BEGIN
 IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
 IF NOT FOUND OR v.service::text<>'cleaning' THEN RAISE EXCEPTION 'cleaning_visit_required'; END IF;
 IF v.assigned_pro_id IS NULL THEN RAISE EXCEPTION 'assigned_pro_required_before_booking_deep_clean'; END IF;
 IF EXISTS(SELECT 1 FROM public.addon_attaches WHERE visit_id=v.id AND addon_key='deep_clean' AND status IN ('pending_visit','completed')) THEN RAISE EXCEPTION 'deep_clean_already_booked'; END IF;
 SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;
 extra:=_minutes::numeric/60 * CASE WHEN v.size_tier=5 THEN 2 ELSE 1 END;
 share:=CASE WHEN v.size_tier=5 AND t.kind='paired_pros' THEN 2 ELSE 1 END;
 FOR p IN SELECT v.assigned_pro_id UNION SELECT t.partner_pro_id WHERE t.kind='paired_pros' AND t.partner_pro_id IS NOT NULL LOOP
 IF public.sched_booked(p,v.visit_date,v.id)+(coalesce(v.budget_hours,0)+extra)/share > public.sched_pro_cap(p,v.visit_date)+0.0001 THEN RAISE EXCEPTION 'deep_clean_does_not_fit_choose_later_visit'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.deep_clean_capacity_check(uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deep_clean_capacity_check(uuid,integer) TO service_role;