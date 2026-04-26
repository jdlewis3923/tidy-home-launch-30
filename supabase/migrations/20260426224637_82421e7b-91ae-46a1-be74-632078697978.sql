-- Generic Meta vault setter/getter pair: stores 4 named values in vault.secrets.
-- Mirrors the existing admin_set_jobber_refresh_token / admin_get_jobber_refresh_token pattern.

-- Setter
CREATE OR REPLACE FUNCTION public.admin_set_meta_secret(_name text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_id uuid;
  v_allowed text[] := array['meta_business_id','meta_pixel_id','meta_capi_access_token','meta_user_access_token'];
begin
  -- Allow admin user OR service role (no auth.uid()).
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  if not (_name = any(v_allowed)) then
    raise exception 'invalid secret name: %', _name;
  end if;

  select id into v_id from vault.secrets where name = _name limit 1;
  if v_id is null then
    perform vault.create_secret(_value, _name, 'meta oauth captured value');
  else
    perform vault.update_secret(v_id, _value, _name, 'meta oauth captured value');
  end if;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_set_meta_secret(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_meta_secret(text, text) TO authenticated, service_role;

-- Getter
CREATE OR REPLACE FUNCTION public.admin_get_meta_secret(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
declare
  v_value text;
  v_allowed text[] := array['meta_business_id','meta_pixel_id','meta_capi_access_token','meta_user_access_token'];
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  if not (_name = any(v_allowed)) then
    raise exception 'invalid secret name: %', _name;
  end if;

  select decrypted_secret into v_value
  from vault.decrypted_secrets
  where name = _name
  limit 1;

  return v_value;
end;
$$;

REVOKE ALL ON FUNCTION public.admin_get_meta_secret(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_meta_secret(text) TO authenticated, service_role;