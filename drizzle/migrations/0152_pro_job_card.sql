CREATE OR REPLACE FUNCTION public.pro_job_card(_visit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v record; s record; svc text; ver jsonb := '{}'::jsonb; sp boolean; addons jsonb; monthly_lawn boolean := false; k text;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit AND (assigned_pro_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF v.subscription_id IS NOT NULL THEN SELECT * INTO s FROM public.subscriptions WHERE id = v.subscription_id; END IF;
  FOREACH k IN ARRAY CASE
      WHEN v.service_type::text = 'cleaning' THEN ARRAY['cleaning','cleaning_deep_clean']
      WHEN v.service_type::text = 'lawn' THEN ARRAY['lawn']
      ELSE ARRAY['car_wash','car_detail'] END LOOP
    ver := ver || jsonb_build_object(k, CASE WHEN v.user_id IS NOT NULL THEN public.member_scope_version(v.user_id, k) ELSE public.current_scope_version(k) END);
  END LOOP;
  sp := s.has_water_spigot;
  IF sp IS NULL AND v.user_id IS NOT NULL THEN
    SELECT r.spigot_at_parking INTO sp FROM public.reservations r JOIN auth.users u ON lower(u.email)=lower(r.email)
     WHERE u.id = v.user_id AND r.spigot_at_parking IS NOT NULL ORDER BY r.created_at DESC LIMIT 1;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', a.addon_name, 'key', a.addon_key, 'free', a.is_free)), '[]'::jsonb) INTO addons
    FROM public.addon_attaches a WHERE a.visit_id = _visit AND a.removed_at IS NULL;
  monthly_lawn := v.service_type::text = 'lawn' AND coalesce(s.cadence, s.frequency::text) = 'monthly';
  RETURN jsonb_build_object('versions', ver, 'spigot', sp, 'addons', addons, 'monthly_lawn', monthly_lawn,
    'weekly', coalesce(s.cadence, s.frequency::text) = 'weekly', 'visit_kind', v.visit_kind);
END $$;
REVOKE ALL ON FUNCTION public.pro_job_card(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pro_job_card(uuid) TO authenticated;