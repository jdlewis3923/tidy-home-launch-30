CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  first_name text NOT NULL,
  last_name text,
  email text NOT NULL,
  phone text NOT NULL,
  zip text NOT NULL,
  sms_consent boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'website_popup',
  user_agent text,
  page_url text
);

GRANT ALL ON public.leads TO service_role;
GRANT SELECT ON public.leads TO authenticated;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read leads"
  ON public.leads
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
