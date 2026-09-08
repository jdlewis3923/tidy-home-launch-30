-- SECURITY: every SECURITY DEFINER guard written with current_user is broken.
-- Inside a SECURITY DEFINER function current_user is the function OWNER
-- (postgres), never the caller, so:
--   current_user IN ('postgres','service_role','supabase_admin')  -> ALWAYS TRUE
--   current_user = 'service_role'                                 -> ALWAYS FALSE
-- The first opened admin-only RPCs to any signed-in user; the second locked out
-- legitimate service-role callers. Replace both with caller-derived checks.

CREATE OR REPLACE FUNCTION public.is_service_caller()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT
    -- No PostgREST request context => direct database session (pg_cron, psql,
    -- migrations). Those already require superuser-level access.
    nullif(current_setting('request.jwt.claims', true), '') IS NULL
    OR coalesce(
         nullif(current_setting('request.jwt.claim.role', true), ''),
         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
       ) = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.is_privileged_caller()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_service_caller() OR public.has_role(auth.uid(), 'admin'::app_role);
$$;

REVOKE ALL ON FUNCTION public.is_service_caller() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_privileged_caller() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_caller() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_privileged_caller() TO authenticated, service_role;

-- Rewrite every SECURITY DEFINER function whose body still guards on current_user,
-- in place, preserving the rest of the body exactly.
DO $do$
DECLARE r record; def text; newdef text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prosrc LIKE '%current_user%'
  LOOP
    def := pg_get_functiondef(r.oid);
    newdef := replace(def,
      'current_user IN (''postgres'',''service_role'',''supabase_admin'') OR public.has_role(auth.uid(), ''admin''::app_role)',
      'public.is_privileged_caller()');
    newdef := replace(newdef,
      'current_user IN (''postgres'',''service_role'',''supabase_admin'')',
      'public.is_service_caller()');
    newdef := replace(newdef,
      'current_user = ''service_role'' OR public.has_role(auth.uid(), ''admin''::app_role)',
      'public.is_privileged_caller()');
    newdef := replace(newdef, 'current_user = ''service_role''', 'public.is_service_caller()');
    IF newdef <> def THEN
      RAISE NOTICE 'rewriting guard in %', r.proname;
      EXECUTE newdef;
    END IF;
  END LOOP;
END $do$;

-- Least privilege: both of these are invoked only by edge functions holding the
-- service credential. No browser client needs them.
REVOKE EXECUTE ON FUNCTION public.generate_recurring_visits(uuid, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_visit_paid_in_full(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_visits(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_visit_paid_in_full(uuid, text, text, text) TO service_role;
