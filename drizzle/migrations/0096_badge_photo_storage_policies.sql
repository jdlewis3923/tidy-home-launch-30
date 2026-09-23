-- Badge photos are private: only admins read them through the dashboard, and
-- only the service-role upload function (token-scoped) writes them.
DROP POLICY IF EXISTS "Admins read badge photos" ON storage.objects;
CREATE POLICY "Admins read badge photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pro-badge-photos' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage badge photos" ON storage.objects;
CREATE POLICY "Admins manage badge photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pro-badge-photos' AND public.has_role(auth.uid(), 'admin'));