CREATE TABLE public.pro_document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connecteam_user_id bigint NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('agreement','w9','coi','photo_id','badge_photo')),
  document_id bigint,
  application_id uuid REFERENCES public.pro_applications(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  approved_by uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connecteam_user_id, document_type)
);
GRANT SELECT, INSERT, UPDATE ON public.pro_document_reviews TO authenticated;
GRANT ALL ON public.pro_document_reviews TO service_role;
ALTER TABLE public.pro_document_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read Pro document reviews" ON public.pro_document_reviews FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can record Pro document reviews" ON public.pro_document_reviews FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND approved_by = auth.uid());
CREATE POLICY "Admins can update Pro document reviews" ON public.pro_document_reviews FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin') AND approved_by = auth.uid());