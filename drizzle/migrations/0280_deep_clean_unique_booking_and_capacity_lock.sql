CREATE UNIQUE INDEX deep_clean_one_active_per_visit ON public.addon_attaches(visit_id) WHERE addon_key='deep_clean' AND status IN ('pending_visit','completed');
DO $$ DECLARE definition text; BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='deep_clean_capacity_check';
 definition:=replace(definition,'SELECT * INTO v FROM public.visits WHERE id=_visit;','SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;');
 EXECUTE definition;
END $$;