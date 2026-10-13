CREATE OR REPLACE FUNCTION public.sched_launch_locked(_s service_type)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(public.launch_conversion_open(CASE _s::text WHEN 'detailing' THEN 'car' WHEN 'lawn' THEN 'lawn' ELSE 'cleaning' END), false)
$$;