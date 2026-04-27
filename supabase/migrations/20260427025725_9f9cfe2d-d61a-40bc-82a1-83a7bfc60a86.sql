
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_referral_code() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_referral_code() TO postgres, service_role;
