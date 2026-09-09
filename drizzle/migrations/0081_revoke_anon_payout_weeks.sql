REVOKE ALL ON TABLE public.payout_weeks FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.payout_weeks TO authenticated;
GRANT ALL ON TABLE public.payout_weeks TO service_role;
