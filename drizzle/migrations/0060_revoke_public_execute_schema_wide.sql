-- Root cause, fixed as a class: Postgres grants EXECUTE to PUBLIC on every new
-- function and anon/authenticated are members of PUBLIC, so every previous
-- "REVOKE ... FROM anon" removed nothing. Revoke from PUBLIC across the schema,
-- stop the default for future functions, then re-grant only what the app calls.

REVOKE ALL ON TABLE public.plan_line_sets FROM anon, authenticated;
GRANT ALL ON TABLE public.plan_line_sets TO service_role;

REVOKE SELECT (pro_pay_cents, pro_id) ON public.addon_requests FROM anon, authenticated;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $do$;

DO $do$
BEGIN
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'default privileges unchanged (insufficient privilege)';
END $do$;

-- Deliberately public, unauthenticated surface.
GRANT EXECUTE ON FUNCTION public.is_site_live() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.founding_spots_left(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_five_star_proof() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_pro_badge(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_load(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_save(text, jsonb, boolean) TO anon, authenticated;

-- Signed-in surface. Each of these carries its own auth.uid()/has_role check.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_service_caller() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_privileged_caller() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_get_me() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_get_visits(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pro_coi_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pro_capacity_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_preferred_pro_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.customers_needing_attention() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_customer_pro(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_visit_pro(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unassigned_visits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pro_push_status() TO authenticated;