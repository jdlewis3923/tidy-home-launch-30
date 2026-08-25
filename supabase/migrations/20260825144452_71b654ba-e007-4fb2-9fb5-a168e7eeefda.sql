DROP POLICY IF EXISTS "app_settings public site_live read" ON public.app_settings;
CREATE POLICY "app_settings public site_live read"
ON public.app_settings
FOR SELECT
TO anon, authenticated
USING (key = 'site_live');

REVOKE ALL ON FUNCTION public.current_user_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_admin() TO service_role;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;

REVOKE ALL ON FUNCTION public.is_contractor_job_eligible(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_contractor_job_eligible(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_get_scheduler_paused() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_scheduler_paused() TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_scheduler_paused(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_scheduler_paused(boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_site_live(boolean) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_site_live(boolean) TO service_role;