CREATE OR REPLACE FUNCTION public.signing_intake_save(_token text,_patch jsonb,_submit boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k public.pro_kit; p jsonb:=coalesce(_patch,'{}'); result jsonb; f text; v jsonb;
BEGIN
 IF length(coalesce(_token,''))<20 OR jsonb_typeof(p)<>'object' OR octet_length(p::text)>20000 THEN RAISE EXCEPTION 'invalid_input'; END IF;
 SELECT * INTO k FROM public.pro_kit WHERE token=_token FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found'); END IF;
 IF k.token_expires_at<now() THEN RETURN jsonb_build_object('state','expired'); END IF;
 IF k.status<>'sent' THEN RETURN jsonb_build_object('state','closed'); END IF;
 FOR f,v IN SELECT * FROM jsonb_each(p) LOOP
 IF jsonb_typeof(v)='string' AND length(v#>>'{}')>2000 THEN RAISE EXCEPTION 'field_too_long'; END IF;
 END LOOP;
 IF p ? 'emergency_phone' AND nullif(p->>'emergency_phone','') IS NOT NULL AND length(regexp_replace(p->>'emergency_phone','\D','','g')) NOT BETWEEN 10 AND 15 THEN RAISE EXCEPTION 'invalid_emergency_phone'; END IF;
 IF p ? 'email' AND nullif(p->>'email','') IS NOT NULL AND p->>'email' !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
 IF p ? 'home_zip' AND nullif(p->>'home_zip','') IS NOT NULL AND p->>'home_zip' !~ '^\d{5}$' THEN RAISE EXCEPTION 'invalid_zip'; END IF;
 IF p ? 'availability_zips' THEN
 IF jsonb_typeof(p->'availability_zips')<>'array' OR jsonb_array_length(p->'availability_zips')>30 THEN RAISE EXCEPTION 'invalid_zips'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'availability_zips') z WHERE z !~ '^\d{5}$') THEN RAISE EXCEPTION 'invalid_zips'; END IF;
 END IF;
 IF p ? 'equipment_checked' AND (jsonb_typeof(p->'equipment_checked')<>'array' OR jsonb_array_length(p->'equipment_checked')>100) THEN RAISE EXCEPTION 'invalid_equipment'; END IF;
 UPDATE public.pro_kit SET emergency_name=CASE WHEN p?'emergency_name' THEN nullif(trim(p->>'emergency_name'),'') ELSE emergency_name END,emergency_phone=CASE WHEN p?'emergency_phone' THEN nullif(p->>'emergency_phone','') ELSE emergency_phone END,emergency_relationship=CASE WHEN p?'emergency_relationship' THEN nullif(trim(p->>'emergency_relationship'),'') ELSE emergency_relationship END,equipment_checked=coalesce(p->'equipment_checked',equipment_checked),availability_zips=coalesce(p->'availability_zips',availability_zips),intake_updated_at=now() WHERE id=k.id;
 result:=public.intake_save(_token,p,false);
 IF result->>'state' NOT IN ('open','saved') THEN RETURN result; END IF;
 IF _submit THEN
 SELECT * INTO k FROM public.pro_kit WHERE id=k.id;
 IF k.signing_day_mode AND (nullif(trim(k.legal_name),'') IS NULL OR nullif(trim(k.badge_name),'') IS NULL OR nullif(k.mobile,'') IS NULL OR nullif(k.email,'') IS NULL OR k.home_zip IS NULL OR nullif(trim(k.mail_address),'') IS NULL OR k.emergency_name IS NULL OR k.emergency_phone IS NULL OR k.emergency_relationship IS NULL OR k.shirt_size IS NULL OR k.shirt_cut IS NULL OR k.magnets_opt_in IS NULL OR jsonb_array_length(k.days)=0 OR nullif(trim(k.hours),'') IS NULL OR jsonb_array_length(k.availability_zips)=0 OR jsonb_array_length(k.equipment_checked)=0 OR (public.pipeline_service_key(k.service_line)='lawn' AND k.vest_size IS NULL)) THEN RAISE EXCEPTION 'required_intake_fields_missing'; END IF;
 result:=public.intake_save(_token,'{}',true);
 END IF;
 RETURN result;
END $$;