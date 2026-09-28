ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS doc_key text,
  ADD COLUMN IF NOT EXISTS admin_only boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS company_documents_doc_key_idx ON public.company_documents(doc_key, uploaded_at DESC);