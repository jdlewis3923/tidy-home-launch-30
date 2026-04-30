CREATE POLICY "stripe_connect_pending admin delete"
ON public.stripe_connect_pending
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));