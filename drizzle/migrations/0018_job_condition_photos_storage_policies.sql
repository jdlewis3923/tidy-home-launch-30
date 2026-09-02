-- Pros upload before-photos and add-on condition photos into their own folder
-- (<contractor_id>/...). Customers never write here; the public approval page
-- reads through a service-role signed URL instead.
CREATE POLICY "job_photos_pro_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-condition-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "job_photos_pro_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-condition-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "job_photos_pro_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-condition-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
