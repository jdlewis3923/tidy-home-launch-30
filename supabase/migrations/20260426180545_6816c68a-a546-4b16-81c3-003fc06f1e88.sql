-- Persist the service role key as a DB-level GUC so handle_welcome_signup
-- can authorize its pg_net call. ALTER DATABASE ... SET is not allowed in
-- this environment, so we use ALTER ROLE postgres which the function reads
-- via current_setting('app.settings.service_role_key', true).
do $$
declare
  v_key text;
begin
  -- Read from vault if present (Supabase auto-mirrors edge fn secrets to vault).
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = 'SUPABASE_SERVICE_ROLE_KEY'
    limit 1;
  exception when others then
    v_key := null;
  end;

  if v_key is not null then
    execute format('alter role authenticator set app.settings.service_role_key = %L', v_key);
    execute format('alter role postgres set app.settings.service_role_key = %L', v_key);
  else
    raise warning 'SUPABASE_SERVICE_ROLE_KEY not found in vault — welcome_signup trigger will skip until set manually';
  end if;
end $$;
