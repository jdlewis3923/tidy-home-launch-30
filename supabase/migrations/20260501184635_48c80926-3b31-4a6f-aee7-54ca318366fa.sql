-- Drop old check constraint if any (name unknown — find & drop dynamically)
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.documenso_templates'::regclass AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.documenso_templates DROP CONSTRAINT %I', c);
  END LOOP;
END$$;

-- Remove old rows
DELETE FROM public.documenso_templates
WHERE doc_type IN ('ica', 'w9', 'direct_deposit');

-- New allowed-values constraint
ALTER TABLE public.documenso_templates
  ADD CONSTRAINT documenso_templates_doc_type_check
  CHECK (doc_type IN ('cleaning', 'lawn', 'detail'));

-- Upsert 3 service-role envelope rows
INSERT INTO public.documenso_templates (doc_type, label, template_id, updated_at)
VALUES
  ('cleaning', 'Cleaning Contractor Envelope', 'envelope_wssermseotezumhh', now()),
  ('lawn',     'Lawn Contractor Envelope',     'envelope_yceyfwabvronvikk', now()),
  ('detail',   'Detail Contractor Envelope',   'envelope_kadmyfcomkwwkxra', now())
ON CONFLICT (doc_type) DO UPDATE
  SET template_id = EXCLUDED.template_id,
      label = EXCLUDED.label,
      updated_at = now();