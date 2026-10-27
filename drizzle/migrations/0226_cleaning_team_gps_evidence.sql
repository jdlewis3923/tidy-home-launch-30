CREATE TABLE public.cleaning_team_presence(visit_id uuid NOT NULL REFERENCES public.visits(id),pro_id uuid NOT NULL,check_in_at timestamptz,check_in_lat numeric,check_in_lng numeric,check_out_at timestamptz,check_out_lat numeric,check_out_lng numeric,PRIMARY KEY(visit_id,pro_id));
GRANT SELECT ON public.cleaning_team_presence TO authenticated; GRANT ALL ON public.cleaning_team_presence TO service_role;
ALTER TABLE public.cleaning_team_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY cleaning_presence_read ON public.cleaning_team_presence FOR SELECT TO authenticated USING(public.pro_on_cleaning_team_visit(visit_id,auth.uid()) OR public.current_user_admin());
CREATE OR REPLACE FUNCTION public.cleaning_team_presence_record(_visit uuid,_pro uuid,_action text,_lat numeric,_lng numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v public.visits; BEGIN
 IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
 IF _action NOT IN ('check_in','check_out') OR _action IS NULL OR _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid_location'; END IF;
 SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
 IF NOT FOUND OR v.service::text<>'cleaning' OR v.status::text NOT IN ('scheduled','on_the_way','in_progress') OR NOT public.pro_on_cleaning_team_visit(_visit,_pro) THEN RAISE EXCEPTION 'visit_not_assigned'; END IF;
 IF _action='check_in' THEN INSERT INTO public.cleaning_team_presence(visit_id,pro_id,check_in_at,check_in_lat,check_in_lng) VALUES(_visit,_pro,now(),_lat,_lng) ON CONFLICT(visit_id,pro_id) DO UPDATE SET check_in_at=coalesce(cleaning_team_presence.check_in_at,excluded.check_in_at),check_in_lat=excluded.check_in_lat,check_in_lng=excluded.check_in_lng;
 ELSE UPDATE public.cleaning_team_presence SET check_out_at=now(),check_out_lat=_lat,check_out_lng=_lng WHERE visit_id=_visit AND pro_id=_pro AND check_in_at IS NOT NULL; IF NOT FOUND THEN RAISE EXCEPTION 'gps_check_in_required'; END IF; END IF;
END $$;
REVOKE ALL ON FUNCTION public.cleaning_team_presence_record(uuid,uuid,text,numeric,numeric) FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.cleaning_team_presence_record(uuid,uuid,text,numeric,numeric) TO service_role;
CREATE OR REPLACE FUNCTION public.cleaning_team_close_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ DECLARE t public.cleaning_teams; BEGIN IF NEW.service::text='cleaning' AND NEW.size_tier=5 AND NEW.status::text='complete' AND OLD.status::text<>'complete' THEN
 IF NEW.cleaning_final_inspection_at IS NULL OR jsonb_array_length(NEW.cleaning_zones)=0 THEN RAISE EXCEPTION 'lead_inspection_and_zones_required'; END IF;
 IF NOT public.cleaning_team_valid(NEW.cleaning_team_id) THEN RAISE EXCEPTION 'team_not_verified'; END IF;
 SELECT * INTO t FROM public.cleaning_teams WHERE id=NEW.cleaning_team_id;
 IF t.kind='paired_pros' AND EXISTS(SELECT 1 FROM (VALUES(t.lead_pro_id),(t.partner_pro_id)) AS members(pro_id) WHERE NOT EXISTS(SELECT 1 FROM public.cleaning_team_presence p WHERE p.visit_id=NEW.id AND p.pro_id=members.pro_id AND p.check_in_at IS NOT NULL AND p.check_out_at IS NOT NULL)) THEN RAISE EXCEPTION 'both_pros_check_out_required'; END IF;
 END IF; RETURN NEW; END $$;