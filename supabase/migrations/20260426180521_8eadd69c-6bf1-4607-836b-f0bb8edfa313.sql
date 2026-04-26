-- Phase 6: welcome_signup Zapier trigger.
-- Fires send-zapier-event('welcome_signup', ...) via pg_net when a new
-- auth.users row is inserted. Non-blocking — pg_net dispatches async.

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_welcome_signup()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/send-zapier-event';
  v_service_key text := current_setting('app.settings.service_role_key', true);
  v_lang text;
begin
  -- Best-effort language pick from raw_user_meta_data, default 'en'.
  v_lang := coalesce(new.raw_user_meta_data ->> 'language', 'en');
  if v_lang not in ('en', 'es') then
    v_lang := 'en';
  end if;

  -- If service key isn't configured, skip silently — trigger must never
  -- block account creation.
  if v_service_key is null or length(v_service_key) = 0 then
    raise warning '[handle_welcome_signup] app.settings.service_role_key not set; skipping zap';
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

drop trigger if exists on_auth_user_created_welcome_zap on auth.users;
create trigger on_auth_user_created_welcome_zap
  after insert on auth.users
  for each row execute function public.handle_welcome_signup();
