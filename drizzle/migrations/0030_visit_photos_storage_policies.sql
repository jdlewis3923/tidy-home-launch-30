-- Pros read/write only their own folder in the private visit-photos bucket.
DROP POLICY IF EXISTS "visit photos pro read own" ON storage.objects;
CREATE POLICY "visit photos pro read own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'visit-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "visit photos pro insert own" ON storage.objects;
CREATE POLICY "visit photos pro insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'visit-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "visit photos pro delete own" ON storage.objects;
CREATE POLICY "visit photos pro delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'visit-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
