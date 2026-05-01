
-- Switch from HelloSign to Documenso

-- 1. Rename hellosign_doc_id → documenso_doc_id on company_documents
ALTER TABLE public.company_documents
  RENAME COLUMN hellosign_doc_id TO documenso_doc_id;

-- 2. Add Documenso tracking to applicants
ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS documenso_document_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contracts_signed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contracts_signed_at timestamptz;

-- 3. Templates table — Justin pastes Documenso template IDs here
CREATE TABLE IF NOT EXISTS public.documenso_templates (
  doc_type    text PRIMARY KEY,
  template_id text,
  label       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE public.documenso_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documenso_templates admin all"
  ON public.documenso_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role + edge functions also read this — readable to authenticated for admin only is fine;
-- edge functions use service-role which bypasses RLS.

-- Seed the 3 envelope rows (template_id left NULL until Justin pastes)
INSERT INTO public.documenso_templates (doc_type, label) VALUES
  ('ica',            'Independent Contractor Agreement'),
  ('w9',             'IRS W-9'),
  ('direct_deposit', 'Direct Deposit Authorization')
ON CONFLICT (doc_type) DO NOTHING;

-- Auto-update updated_at
CREATE TRIGGER documenso_templates_updated_at
  BEFORE UPDATE ON public.documenso_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
