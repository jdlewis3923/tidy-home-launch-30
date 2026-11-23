ALTER TABLE public.contract_templates DROP CONSTRAINT contract_templates_service_check;
ALTER TABLE public.contract_templates ADD CONSTRAINT contract_templates_service_check CHECK (service IN ('cleaning','lawn','detailing'));
COMMENT ON COLUMN public.contract_templates.is_current IS 'Only current templates are issued; inactive draft versions must not be sent or signed automatically.';
CREATE OR REPLACE FUNCTION public.pro_required_check_keys(_service text,_kind text)
RETURNS text[] LANGUAGE sql STABLE SET search_path=public AS $$
SELECT CASE WHEN _service='cleaning' THEN ARRAY['shoe_covers','top_bottom','surface_safe'] WHEN _service='lawn' THEN ARRAY['electric_blower'] ELSE ARRAY[]::text[] END
|| coalesce((SELECT array_agg('scope:'||service||':'||sort_order ORDER BY service,sort_order)
 FROM public.service_scope WHERE active AND section='included'
 AND service=ANY(CASE WHEN _service='cleaning' THEN CASE WHEN _kind='quarterly_deep_clean' THEN ARRAY['cleaning','cleaning_deep_clean'] ELSE ARRAY['cleaning'] END
 WHEN _service='lawn' THEN ARRAY['lawn']
 WHEN _kind='full_detail' THEN ARRAY['car_wash','car_detail'] ELSE ARRAY['car_wash'] END)),ARRAY[]::text[])
|| ARRAY['locked','alarm','lights_ac','keys_returned']
$$;
REVOKE ALL ON FUNCTION public.pro_required_check_keys(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_required_check_keys(text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pro_service_checklist(_visit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; c jsonb; legacy jsonb; labels jsonb;
BEGIN
 SELECT * INTO v FROM public.visits WHERE id=_visit;
 IF NOT FOUND OR NOT public.pro_on_cleaning_team_visit(v.id,auth.uid()) THEN RAISE EXCEPTION 'visit_not_assigned'; END IF;
 SELECT checks INTO c FROM public.pro_visit_checks WHERE visit_id=v.id AND pro_id=auth.uid();
 IF v.service::text='cleaning' THEN SELECT checks INTO legacy FROM public.cleaning_visit_checks WHERE visit_id=v.id AND pro_id=auth.uid(); END IF;
 SELECT jsonb_object_agg('scope:'||service||':'||sort_order,jsonb_build_object('en',text_en,'es',text_es)) INTO labels
 FROM public.service_scope WHERE active AND section='included';
 RETURN jsonb_build_object('keys',public.pro_required_check_keys(v.service::text,v.visit_kind),'labels',coalesce(labels,'{}'::jsonb),
 'checks',coalesce(legacy,'{}'::jsonb)||coalesce(c,'{}'::jsonb),'closed',v.status::text NOT IN ('scheduled','on_the_way','in_progress'));
END $$;
REVOKE ALL ON FUNCTION public.pro_service_checklist(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_service_checklist(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.pro_cleaning_checklist(_visit uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; result jsonb;
BEGIN
 IF NOT public.pro_on_cleaning_team_visit(_visit,auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=_visit;
 IF v.service::text<>'cleaning' THEN RETURN NULL; END IF;
 result:=public.pro_service_checklist(_visit);
 RETURN result||jsonb_build_object('rotation',NULL);
END $$;
REVOKE ALL ON FUNCTION public.pro_cleaning_checklist(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_cleaning_checklist(uuid) TO authenticated,service_role;