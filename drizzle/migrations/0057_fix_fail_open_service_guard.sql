CREATE OR REPLACE FUNCTION public.is_service_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    ) = 'service_role'
    OR (
      nullif(current_setting('request.jwt.claims', true), '') IS NULL
      AND nullif(current_setting('request.jwt.claim.role', true), '') IS NULL
      AND session_user IN ('postgres', 'supabase_admin')
    );
$fn$;