CREATE OR REPLACE FUNCTION public.admin_get_jobber_refresh_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_token text;
begin
  -- Allow service role (no auth.uid()) or admin user.
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'jobber_refresh_token'
  limit 1;

  return v_token;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_jobber_refresh_token() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_jobber_refresh_token() TO authenticated, service_role;