-- Lock down admin_* RPCs: revoke EXECUTE from anon + authenticated.
-- These functions are SECURITY DEFINER and already check has_role(admin)
-- internally, but the linter flags any function callable by anon/authenticated.
-- Service role and postgres owner retain access for edge functions + DB jobs.

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.admin_get_jobber_refresh_token()',
    'public.admin_set_jobber_refresh_token(text)',
    'public.admin_get_meta_secret(text)',
    'public.admin_set_meta_secret(text, text)',
    'public.admin_get_service_role_key()',
    'public.admin_set_service_role_key(text)',
    'public.current_user_admin()',
    'public.has_role(uuid, public.app_role)',
    'public.generate_referral_code()',
    'public.handle_new_user()',
    'public.handle_welcome_signup()',
    'public.update_updated_at_column()'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO postgres, service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing fn %', fn;
    END;
  END LOOP;
END $$;

-- has_role + current_user_admin are needed by RLS policies which run as the
-- calling user (authenticated) — re-grant just those two.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_admin() TO authenticated;