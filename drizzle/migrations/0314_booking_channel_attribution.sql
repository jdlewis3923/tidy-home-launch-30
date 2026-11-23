ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS heard_from text;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_heard_from_valid CHECK (heard_from IS NULL OR heard_from IN ('door_hanger','google','nextdoor','facebook_instagram','referral','other'));
GRANT SELECT (heard_from) ON public.subscriptions TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_booking_attribution() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 RETURN jsonb_build_object(
 'channels', (SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) FROM (
 SELECT channel, sum(reservations) AS reservations, sum(paid_plans) AS paid_plans FROM (
 SELECT coalesce(nullif(heard_from,''),'unknown') AS channel,count(*) AS reservations,0::bigint AS paid_plans FROM public.reservations WHERE NOT is_test_row AND status <> 'canceled' GROUP BY 1
 UNION ALL SELECT coalesce(nullif(s.heard_from,''),'unknown'),0::bigint,count(*) FROM public.subscriptions s WHERE s.stripe_subscription_id IS NOT NULL AND s.stripe_subscription_id LIKE 'sub_%' AND s.status='active' AND NOT EXISTS(SELECT 1 FROM public.reservations r WHERE r.user_id=s.user_id AND r.is_test_row) GROUP BY 1
 ) a GROUP BY channel ORDER BY channel) c),
 'qr_zips', (SELECT coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) FROM (SELECT coalesce(zip,'unknown') AS zip,count(*) AS scans FROM public.qr_scans GROUP BY 1 ORDER BY 1) q));
END $$;
REVOKE ALL ON FUNCTION public.admin_booking_attribution() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_booking_attribution() TO authenticated,service_role;