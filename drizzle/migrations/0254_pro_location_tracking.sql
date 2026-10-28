CREATE TABLE public.pro_location_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.visits(id) ON DELETE CASCADE,
  pro_user_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  distance_m numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pro_location_pings_visit_time ON public.pro_location_pings (visit_id, created_at DESC);
GRANT SELECT ON public.pro_location_pings TO authenticated;
GRANT ALL ON public.pro_location_pings TO service_role;
ALTER TABLE public.pro_location_pings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read pings" ON public.pro_location_pings FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.pro_record_ping(_visit uuid,_pro uuid,_lat double precision,_lng double precision,_accuracy double precision DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; d double precision;
BEGIN
  IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v FROM public.visits WHERE id=_visit;
  IF NOT FOUND OR (v.assigned_pro_id IS DISTINCT FROM _pro AND v.backup_pro_id IS DISTINCT FROM _pro) THEN RAISE EXCEPTION 'visit_not_assigned'; END IF;
  IF v.status NOT IN ('on_the_way','in_progress') THEN RETURN jsonb_build_object('ok',false,'error','visit_not_active'); END IF;
  IF _lat IS NULL OR _lng IS NULL OR _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'invalid_location'; END IF;
  IF v.address_lat IS NOT NULL AND v.address_lng IS NOT NULL THEN
    d:=public.pro_gps_distance(_lat,_lng,v.address_lat,v.address_lng);
  END IF;
  INSERT INTO public.pro_location_pings (visit_id,pro_user_id,lat,lng,accuracy_m,distance_m) VALUES (_visit,_pro,_lat,_lng,_accuracy,d);
  RETURN jsonb_build_object('ok',true,'distance_meters',CASE WHEN d IS NULL THEN NULL ELSE round(d::numeric) END);
END $$;
REVOKE ALL ON FUNCTION public.pro_record_ping(uuid,uuid,double precision,double precision,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.pro_record_ping(uuid,uuid,double precision,double precision,double precision) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_pro_tracker(_date text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d date;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  d := coalesce(_date::date, (now() AT TIME ZONE 'America/New_York')::date);
  RETURN coalesce((SELECT jsonb_agg(row_to_json(t) ORDER BY t.scheduled_start) FROM (
    SELECT v.id, v.status, v.service_type, v.visit_kind, v.size_tier, v.scheduled_start, v.scheduled_end,
      v.customer_first_name, v.street, v.zip,
      p.first_name AS pro_first_name,
      v.on_my_way_at, v.check_in_at, v.check_out_at, v.completed_at,
      CASE WHEN v.address_lat IS NOT NULL AND v.check_in_lat IS NOT NULL
        THEN round(public.pro_gps_distance(v.check_in_lat,v.check_in_lng,v.address_lat,v.address_lng)::numeric) END AS check_in_distance_m,
      (SELECT jsonb_build_object('distance_m',ping.distance_m,'at',ping.created_at)
        FROM public.pro_location_pings ping WHERE ping.visit_id=v.id ORDER BY ping.created_at DESC LIMIT 1) AS last_ping,
      (v.check_in_at IS NULL AND v.status NOT IN ('complete','canceled','skipped','blocked')
        AND v.scheduled_start IS NOT NULL AND now() > v.scheduled_start + interval '15 minutes') AS is_late
    FROM public.visits v
    LEFT JOIN public.profiles p ON p.user_id = v.assigned_pro_id
    WHERE v.scheduled_start IS NOT NULL
      AND (v.scheduled_start AT TIME ZONE 'America/New_York')::date = d
  ) t),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.admin_pro_tracker(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_pro_tracker(text) TO authenticated;