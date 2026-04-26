-- Admin-only setter for the vault-stored service_role_key used by
-- handle_welcome_signup. Callable via PostgREST RPC as the admin user;
-- the value is passed at call time and never written to migration logs.
create or replace function public.admin_set_service_role_key(_key text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;

  select id into v_id from vault.secrets where name = 'service_role_key' limit 1;
  if v_id is null then
    perform vault.create_secret(_key, 'service_role_key', 'welcome trigger auth');
  else
    perform vault.update_secret(v_id, _key, 'service_role_key', 'welcome trigger auth');
  end if;
end;
$$;

revoke all on function public.admin_set_service_role_key(text) from public, anon;
grant execute on function public.admin_set_service_role_key(text) to authenticated;
