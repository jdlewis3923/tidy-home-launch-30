-- Switch handle_welcome_signup to read service key from vault.
create or replace function public.handle_welcome_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_url text := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/send-zapier-event';
  v_service_key text;
  v_lang text;
begin
  begin
    select decrypted_secret into v_service_key
    from vault.decrypted_secrets
    where name = 'service_role_key'
    limit 1;
  exception when others then
    v_service_key := null;
  end;

  v_lang := coalesce(new.raw_user_meta_data ->> 'language', 'en');
  if v_lang not in ('en', 'es') then
    v_lang := 'en';
  end if;

  if v_service_key is null or length(v_service_key) = 0 then
    raise warning '[handle_welcome_signup] vault.service_role_key not set; skipping zap';
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'event_name', 'welcome_signup',
      'lang', v_lang,
      'user_id', new.id::text,
      'payload', jsonb_build_object(
        'email', new.email,
        'first_name', new.raw_user_meta_data ->> 'first_name',
        'last_name', new.raw_user_meta_data ->> 'last_name',
        'phone', new.raw_user_meta_data ->> 'phone'
      )
    )
  );

  return new;
exception when others then
  raise warning '[handle_welcome_signup] zap dispatch failed: %', sqlerrm;
  return new;
end;
$$;
