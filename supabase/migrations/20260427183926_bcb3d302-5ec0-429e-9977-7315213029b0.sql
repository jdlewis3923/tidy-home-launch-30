-- Tighten EXECUTE perms on scheduler control RPCs.
-- Both functions already enforce admin role in body, but anon should not
-- even be able to invoke them. Revoke from anon + authenticated; the
-- service role and postgres role retain access via default GRANTs.
REVOKE EXECUTE ON FUNCTION public.admin_get_scheduler_paused() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_scheduler_paused(boolean) FROM anon, authenticated, public;

-- Re-grant to authenticated only (admins call via JWT-authenticated client).
GRANT EXECUTE ON FUNCTION public.admin_get_scheduler_paused() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_scheduler_paused(boolean) TO authenticated;