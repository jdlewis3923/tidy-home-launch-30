-- Expand the meta secret whitelist to include the 3 auto-discovered IDs/tokens
-- that meta-publish-post needs to cache. Day 1's failure was caused by the old
-- whitelist rejecting "meta_ig_user_id".

CREATE OR REPLACE FUNCTION public.admin_set_meta_secret(_name text, _value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_id uuid;
  v_allowed text[] := array[
    'meta_business_id',
    'meta_pixel_id',
    'meta_capi_access_token',
    'meta_user_access_token',
    'meta_ig_user_id',
    'meta_fb_page_id',
    'meta_fb_page_access_token'
  ];
begin
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_meta_secret(_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_value text;
  v_allowed text[] := array[
    'meta_business_id',
    'meta_pixel_id',
    'meta_capi_access_token',
    'meta_user_access_token',
    'meta_ig_user_id',
    'meta_fb_page_id',
    'meta_fb_page_access_token'
  ];
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
$function$;

-- Reset day 1 back to scheduled so the cron picks it back up after the fix
UPDATE public.social_posts
   SET status = 'scheduled', error_message = NULL
 WHERE day_number = 1 AND status = 'failed';