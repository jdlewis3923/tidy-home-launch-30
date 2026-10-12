CREATE OR REPLACE FUNCTION public.my_pro_services() RETURNS public.service_type[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.sched_pro_services(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.my_pro_services() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pro_services() TO authenticated;