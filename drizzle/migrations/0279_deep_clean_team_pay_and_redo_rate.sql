CREATE OR REPLACE FUNCTION public.deep_clean_attach_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.addon_key<>'deep_clean' THEN RETURN NEW; END IF;
 IF NEW.is_free THEN RAISE EXCEPTION 'deep_clean_not_giftable'; END IF;
 NEW.split_pay:=EXISTS(SELECT 1 FROM public.visits v JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id WHERE v.id=NEW.visit_id AND v.size_tier=5 AND t.kind='paired_pros');
 IF NEW.status='completed' AND EXISTS(SELECT 1 FROM public.service_scope s WHERE s.addon_key='deep_clean' AND s.active AND NOT EXISTS(SELECT 1 FROM public.deep_clean_item_checks c WHERE c.attach_id=NEW.id AND c.scope_row_id=s.id)) THEN RAISE EXCEPTION 'deep_clean_six_after_photos_required'; END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='redo_completion_pay_guard';
 definition:=replace(definition,'original_rate:=coalesce(orig.visit_pay_cents,orig.contractor_pay_cents,0);','original_rate:=coalesce(orig.visit_pay_cents,orig.contractor_pay_cents,0) + coalesce((SELECT sum(contractor_pay_cents)::integer FROM public.addon_attaches WHERE visit_id=orig.id AND addon_key=''deep_clean'' AND status=''completed''),0);');
 EXECUTE definition;
END $$;