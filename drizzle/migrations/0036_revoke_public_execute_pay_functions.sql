-- Default PUBLIC execute on functions is what let any authenticated customer
-- call the pay schedule. Revoking from authenticated/anon alone is not enough.
REVOKE ALL ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contractor_visit_pay_cents(text, smallint, text, text, boolean, text) TO service_role;

REVOKE ALL ON FUNCTION public.pro_visit_pay_cents(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pro_visit_pay_cents(text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pro_visit_pay_cents(text, text, text) TO service_role;

-- Admin-only reporting RPC: no PUBLIC default either. The body already raises
-- for non-admins; this removes the ability to reach the body at all.
REVOKE ALL ON FUNCTION public.customers_needing_attention() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customers_needing_attention() FROM anon;
GRANT EXECUTE ON FUNCTION public.customers_needing_attention() TO authenticated, service_role;
