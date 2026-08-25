CREATE OR REPLACE FUNCTION public.is_site_live()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce((select (value)::boolean from public.app_settings where key = 'site_live'), true);
$$;

REVOKE ALL ON FUNCTION public.is_site_live() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_live() TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_contractor_job_eligible(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_contractor_job_eligible(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_scheduler_paused() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_scheduler_paused() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_scheduler_paused(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_scheduler_paused(boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_site_live(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_site_live(boolean) TO authenticated, service_role;