-- Phase 3: persist rotated Jobber refresh tokens into pg vault.
-- Mirrors admin_set_service_role_key. Callable only by the service role
-- (no GRANT to anon/authenticated). The Jobber edge functions invoke it
-- via supabase.rpc() using the service role key.
CREATE OR REPLACE FUNCTION public.admin_set_jobber_refresh_token(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_id uuid;
begin
  -- Allow either an admin user OR the service role (which has no auth.uid()).
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;

  select id into v_id from vault.secrets where name = 'jobber_refresh_token' limit 1;
  if v_id is null then
    perform vault.create_secret(_token, 'jobber_refresh_token', 'jobber oauth rotated refresh token');
  else
    perform vault.update_secret(v_id, _token, 'jobber_refresh_token', 'jobber oauth rotated refresh token');
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_set_jobber_refresh_token(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_jobber_refresh_token(text) TO service_role;