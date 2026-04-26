CREATE OR REPLACE FUNCTION public.admin_get_service_role_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_key text;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'service_role_key'
  limit 1;

  return v_key;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_service_role_key() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_service_role_key() TO authenticated, service_role;