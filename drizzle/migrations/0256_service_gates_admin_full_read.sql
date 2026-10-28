GRANT SELECT ON public.service_gates TO authenticated;
DROP POLICY IF EXISTS "service_gates read live flags" ON public.service_gates;
CREATE OR REPLACE FUNCTION public.get_service_gates_public()
RETURNS TABLE(service text, is_live boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT g.service::text, g.is_live FROM public.service_gates g $$;
REVOKE ALL ON FUNCTION public.get_service_gates_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_gates_public() TO anon, authenticated;