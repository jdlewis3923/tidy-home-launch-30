-- Company documents library (admin-only)
CREATE TABLE public.company_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes INTEGER,
  current_version BOOLEAN NOT NULL DEFAULT true,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contractor_id UUID, -- no FK yet; contractors table TBD
  hellosign_doc_id TEXT,
  brevo_template_id INTEGER,
  searchable_text TEXT,
  archived_at TIMESTAMPTZ,
  archive_reason TEXT
);

CREATE INDEX idx_docs_search
  ON public.company_documents
  USING GIN (to_tsvector('english', filename || ' ' || coalesce(searchable_text, '')));

CREATE INDEX idx_docs_category
  ON public.company_documents(category)
  WHERE archived_at IS NULL;

CREATE INDEX idx_docs_contractor
  ON public.company_documents(contractor_id);

CREATE INDEX idx_docs_uploaded_at
  ON public.company_documents(uploaded_at DESC);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_documents admin select"
  ON public.company_documents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_documents admin insert"
  ON public.company_documents FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_documents admin update"
  ON public.company_documents FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company_documents admin delete"
  ON public.company_documents FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Storage bucket: private, admin-only
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-docs', 'company-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "company-docs admin select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-docs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company-docs admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-docs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company-docs admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-docs' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "company-docs admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'company-docs' AND public.has_role(auth.uid(), 'admin'::app_role));