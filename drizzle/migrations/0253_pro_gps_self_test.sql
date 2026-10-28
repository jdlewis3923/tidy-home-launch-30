CREATE TABLE public.pro_gps_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_user_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  target_address text,
  target_lat double precision,
  target_lng double precision,
  distance_m numeric,
  result text NOT NULL DEFAULT 'no_target' CHECK (result IN ('within_150m','outside_150m','no_target')),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.pro_gps_tests TO authenticated;
GRANT ALL ON public.pro_gps_tests TO service_role;
ALTER TABLE public.pro_gps_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pro insert own gps test" ON public.pro_gps_tests FOR INSERT TO authenticated WITH CHECK (pro_user_id = auth.uid());
CREATE POLICY "pro read own gps tests" ON public.pro_gps_tests FOR SELECT TO authenticated USING (pro_user_id = auth.uid());
CREATE POLICY "admin read gps tests" ON public.pro_gps_tests FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));