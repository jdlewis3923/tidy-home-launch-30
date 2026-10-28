DROP POLICY IF EXISTS "service_days signed-in read" ON public.service_days;
DROP POLICY IF EXISTS "sched_blackouts signed-in read" ON public.sched_blackouts;
DROP POLICY IF EXISTS "sched_config signed-in read" ON public.sched_config;
DROP POLICY IF EXISTS "rate cards readable by members" ON public.rate_cards;
DROP POLICY IF EXISTS "scope versions readable" ON public.scope_versions;
DROP POLICY IF EXISTS "Bundle discount tiers are publicly readable" ON public.bundle_discount_tiers;
DROP POLICY IF EXISTS "faq public read" ON public.candidate_faq;
DROP POLICY IF EXISTS "question bank public read" ON public.question_bank;
DROP POLICY IF EXISTS "Anyone can read insurance requirements" ON public.insurance_requirements;

DROP POLICY IF EXISTS "scope readable by everyone" ON public.service_scope;
CREATE POLICY "active scope readable" ON public.service_scope FOR SELECT TO anon, authenticated USING (active = true);

DROP POLICY IF EXISTS "service_gates public read" ON public.service_gates;
CREATE POLICY "service_gates read live flags" ON public.service_gates FOR SELECT TO anon, authenticated USING (service IS NOT NULL);
REVOKE SELECT ON public.service_gates FROM anon, authenticated;
GRANT SELECT (service, is_live) ON public.service_gates TO anon, authenticated;

DROP POLICY IF EXISTS "Launch dates are public" ON public.launch_config;
CREATE POLICY "Launch dates readable" ON public.launch_config FOR SELECT TO anon, authenticated USING (scope IS NOT NULL);
REVOKE SELECT ON public.launch_config FROM anon, authenticated;
GRANT SELECT (scope, first_visit_date, conversion_date, pro_callback_date, pro_ready_by, late_first_visit_week, hanger_drops, updated_at, car_launch_threshold, car_proposed_first_visit, car_proposed_conversion, car_proposed_at, car_proposed_for, car_threshold_reached_at) ON public.launch_config TO anon, authenticated;