DROP POLICY "qr_scans_insert_anyone" ON public.qr_scans;
DROP POLICY "landing_touches anon insert" ON public.landing_touches;
REVOKE INSERT ON public.qr_scans FROM anon, authenticated;
REVOKE INSERT ON public.landing_touches FROM anon, authenticated;

DROP POLICY "rate cards readable" ON public.rate_cards;
CREATE POLICY "rate cards readable by members" ON public.rate_cards FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.rate_cards FROM anon;

DROP POLICY "Authenticated can read onboarding modules" ON public.onboarding_module;
CREATE POLICY "Pros and admins read onboarding modules" ON public.onboarding_module FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'pro'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));