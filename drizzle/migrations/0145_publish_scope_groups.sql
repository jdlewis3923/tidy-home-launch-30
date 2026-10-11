CREATE OR REPLACE FUNCTION public.admin_publish_scope(_service text, _rows jsonb, _note text DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new int; r jsonb; v_notice timestamptz := now(); svc_key text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN RAISE EXCEPTION 'rows_required'; END IF;
  v_new := public.current_scope_version(_service) + 1;
  UPDATE public.service_scope SET active = false WHERE service = _service AND active;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    IF coalesce(trim(r->>'text_en'),'') = '' OR coalesce(trim(r->>'text_es'),'') = '' THEN RAISE EXCEPTION 'both_languages_required'; END IF;
    INSERT INTO public.service_scope (service, section, text_en, text_es, addon_key, group_en, group_es, notice_key, sort_order, scope_version, active)
    VALUES (_service, r->>'section', trim(r->>'text_en'), trim(r->>'text_es'), nullif(r->>'addon_key',''),
            nullif(r->>'group_en',''), nullif(r->>'group_es',''), nullif(r->>'notice_key',''),
            coalesce((r->>'sort_order')::int, 0), v_new, true);
  END LOOP;
  INSERT INTO public.scope_versions (service, scope_version, published_by, notice_sent_at, existing_members_from, change_note)
  VALUES (_service, v_new, auth.uid(), v_notice, v_notice + interval '30 days', _note);
  svc_key := CASE WHEN _service IN ('cleaning','cleaning_deep_clean') THEN 'cleaning'
                  WHEN _service = 'lawn' THEN 'lawn' ELSE 'detailing' END;
  INSERT INTO public.member_notifications (user_id, kind, title, body, dedupe_key)
  SELECT DISTINCT s.user_id, 'scope_change',
    'What your plan includes is changing',
    format('We updated what''s included in your plan. Your current terms stay in place until %s. See the new list on your Account page.', to_char(v_notice + interval '30 days','Mon DD, YYYY')),
    format('scope:%s:%s:%s', _service, v_new, s.user_id)
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.user_id IS NOT NULL
    AND (svc_key = ANY (coalesce(s.services, '{}')::text[]) OR (_service = 'car_wash' AND s.car_wash_key IS NOT NULL))
  ON CONFLICT DO NOTHING;
  RETURN v_new;
END $$;