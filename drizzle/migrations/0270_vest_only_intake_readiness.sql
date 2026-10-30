COMMENT ON COLUMN public.pro_kit.polo_size IS 'DEPRECATED: legacy apparel records only; new kits use vest_size';
COMMENT ON COLUMN public.pro_kit.polo_cut IS 'DEPRECATED: legacy apparel records only';
COMMENT ON COLUMN public.pro_kit.shirt_size IS 'DEPRECATED: legacy apparel records only; new kits use vest_size';
COMMENT ON COLUMN public.pro_kit.shirt_cut IS 'DEPRECATED: legacy apparel records only';
COMMENT ON COLUMN public.pro_kit.tee_size IS 'DEPRECATED: legacy apparel records only';
DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.signing_intake_save(text,jsonb,boolean)'::regprocedure) INTO d;
d:=replace(d,'k.shirt_size IS NULL OR k.shirt_cut IS NULL OR','k.vest_size IS NULL OR');
d:=replace(d,'(public.pipeline_service_key(k.service_line)=''lawn'' AND k.vest_size IS NULL)','k.vest_size IS NULL');
d:=replace(d,'result:=public.intake_save(_token,p,false);','IF p ? ''vest_size'' AND nullif(p->>''vest_size'','''') IS NOT NULL AND p->>''vest_size'' NOT IN (''S'',''M'',''L'',''XL'',''2XL'',''3XL'') THEN RAISE EXCEPTION ''invalid_vest_size''; END IF; p:=p-''shirt_size''-''shirt_cut''-''polo_size''-''polo_cut''-''tee_size''-''tee_cut''; result:=public.intake_save(_token,p,false);');
EXECUTE d;
SELECT pg_get_functiondef('public.signing_day_state(uuid)'::regprocedure) INTO d;
d:=replace(d,'nullif(k.shirt_size,'''') IS NOT NULL AND (public.pipeline_service_key(a.service)<>''lawn'' OR nullif(k.vest_size,'''') IS NOT NULL)','nullif(k.vest_size,'''') IS NOT NULL');
EXECUTE d;
END $$;