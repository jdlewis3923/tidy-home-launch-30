CREATE OR REPLACE FUNCTION public.pro_job_card(_visit uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; s public.subscriptions; ver jsonb := '{}'::jsonb; sp boolean; addons jsonb; k text;
BEGIN
 SELECT * INTO v FROM public.visits WHERE id=_visit;
 IF NOT FOUND OR NOT (public.pro_on_cleaning_team_visit(_visit,auth.uid()) OR public.current_user_admin()) THEN RAISE EXCEPTION 'not_found'; END IF;
 IF v.subscription_id IS NOT NULL THEN SELECT * INTO s FROM public.subscriptions WHERE id=v.subscription_id; END IF;
 FOREACH k IN ARRAY CASE WHEN v.service_type::text='cleaning' THEN ARRAY['cleaning','cleaning_deep_clean'] WHEN v.service_type::text='lawn' THEN ARRAY['lawn'] ELSE ARRAY['car_wash','car_detail'] END LOOP
 ver:=ver||jsonb_build_object(k,CASE WHEN v.user_id IS NOT NULL THEN public.member_scope_version(v.user_id,k) ELSE public.current_scope_version(k) END);
 END LOOP;
 sp:=s.has_water_spigot;
 IF sp IS NULL AND v.user_id IS NOT NULL THEN SELECT r.spigot_at_parking INTO sp FROM public.reservations r JOIN auth.users u ON lower(u.email)=lower(r.email) WHERE u.id=v.user_id AND r.spigot_at_parking IS NOT NULL ORDER BY r.created_at DESC LIMIT 1; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.addon_name,'key',a.addon_key,'free',a.is_free)),'[]'::jsonb) INTO addons FROM public.addon_attaches a WHERE a.visit_id=_visit AND a.removed_at IS NULL;
 RETURN jsonb_build_object('versions',ver,'spigot',sp,'addons',addons,'monthly_lawn',v.service_type::text='lawn' AND coalesce(s.cadence,s.frequency::text)='monthly','weekly',coalesce(s.cadence,s.frequency::text)='weekly','visit_kind',v.visit_kind);
END $$;
REVOKE ALL ON FUNCTION public.pro_job_card(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_job_card(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.pro_visit_context(_visit uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; checklist jsonb; t public.cleaning_teams;
BEGIN
 SELECT * INTO v FROM public.visits WHERE id=_visit;
 IF NOT FOUND OR NOT public.pro_on_cleaning_team_visit(v.id,auth.uid()) THEN RETURN NULL; END IF;
 IF v.service::text='cleaning' THEN checklist:=public.pro_cleaning_checklist(v.id); END IF;
 IF v.cleaning_team_id IS NOT NULL THEN SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id; END IF;
 RETURN jsonb_build_object('home_notes',public.pro_home_note(v.id),'rotation',checklist->>'rotation','zones',CASE WHEN v.size_tier=5 THEN v.cleaning_zones ELSE '[]'::jsonb END,'team',CASE WHEN t.id IS NOT NULL THEN jsonb_build_object('lead',public.sched_pro_first_name(v.assigned_pro_id),'partner',CASE WHEN t.kind='paired_pros' THEN public.sched_pro_first_name(coalesce(v.backup_pro_id,t.partner_pro_id)) ELSE t.helper_name END) END,'access_open',public.pro_access_window_open(v.id,auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.pro_visit_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_visit_context(uuid) TO authenticated, service_role;