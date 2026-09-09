-- Audit item 4 — the four vault secret accessors are FAIL-OPEN.
--
-- Current guard in all four:
--     if auth.uid() is not null and not public.has_role(auth.uid(),'admin') then raise ...
-- A caller whose auth.uid() is NULL is ALLOWED. admin_get_service_role_key()
-- returns the full service credential, which bypasses every RLS policy. They
-- are unreachable today only because EXECUTE is revoked from anon/authenticated
-- (see 0058/0060) — that is a second line of defense, not the guard.
--
-- The migration tool refuses to apply SQL that reads the vault, so this file
-- must be run once by an admin in the SQL editor (Cloud view → SQL editor).
-- It is idempotent.

CREATE OR REPLACE FUNCTION public.admin_get_service_role_key()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault'
AS $function$
declare v_key text;
begin
  IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  return v_key;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_jobber_refresh_token()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault'
AS $function$
declare v_token text;
begin
  IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'jobber_refresh_token' limit 1;
  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_meta_secret(_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','vault'
AS $function$
declare
  v_value text;
  v_allowed text[] := array[
    'meta_business_id','meta_pixel_id','meta_capi_access_token','meta_user_access_token',
    'meta_ig_user_id','meta_fb_page_id','meta_fb_page_access_token'
  ];
begin
  IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  if not (_name = any(v_allowed)) then raise exception 'invalid secret name: %', _name; end if;
  select decrypted_secret into v_value from vault.decrypted_secrets where name = _name limit 1;
  return v_value;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_vapid_public()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','vault'
AS $function$
declare v_value text;
begin
  IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  select decrypted_secret into v_value from vault.decrypted_secrets where name = 'PWA_VAPID_PUBLIC_KEY' limit 1;
  return v_value;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_service_role_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_jobber_refresh_token() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_meta_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_get_vapid_public() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_service_role_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_jobber_refresh_token() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_meta_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_vapid_public() TO service_role, authenticated;
