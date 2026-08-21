CREATE OR REPLACE FUNCTION public.admin_set_service_role_key(_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_id uuid;
begin
  -- Allow either an admin user OR the service role (no/blank auth.uid()).
  if coalesce(auth.uid()::text, '') <> '' and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;

  select id into v_id from vault.secrets where name = 'service_role_key' limit 1;
  if v_id is null then
    perform vault.create_secret(_key, 'service_role_key', 'cron/trigger auth');
  else
    perform vault.update_secret(v_id, _key, 'service_role_key', 'cron/trigger auth');
  end if;
end;
$function$;