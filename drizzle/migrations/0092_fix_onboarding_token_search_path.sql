-- gen_random_bytes lives in the extensions schema, so this function needs it on
-- its search_path (it was minting tokens inline rather than only through
-- gen_onboarding_token, which already had it).
ALTER FUNCTION public.admin_onboarding_tokens(uuid, boolean) SET search_path = public, extensions;