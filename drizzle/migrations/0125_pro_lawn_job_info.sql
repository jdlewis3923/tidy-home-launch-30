CREATE OR REPLACE FUNCTION public.pro_lawn_job_info(_visit uuid)
RETURNS TABLE(size_tier smallint, measured_sqft integer, visit_pay_cents integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(v.size_tier, s.size_tier, s.size), s.lawn_measured_sqft, v.visit_pay_cents
    FROM public.visits v
    LEFT JOIN public.subscriptions s ON s.id = v.subscription_id
   WHERE v.id = _visit AND v.assigned_pro_id = auth.uid()
     AND coalesce(v.service_type, v.service::text) = 'lawn'
$$;
REVOKE ALL ON FUNCTION public.pro_lawn_job_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_lawn_job_info(uuid) TO authenticated, service_role;