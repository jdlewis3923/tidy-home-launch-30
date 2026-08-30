CREATE TABLE IF NOT EXISTS public.qr_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_code text NOT NULL,
  parsed boolean NOT NULL DEFAULT false,
  lang text,
  zip text,
  placement text,
  user_agent text,
  referrer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qr_scans_created_at_idx ON public.qr_scans (created_at DESC);

GRANT INSERT ON public.qr_scans TO anon;
GRANT INSERT, SELECT ON public.qr_scans TO authenticated;
GRANT ALL ON public.qr_scans TO service_role;

ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qr_scans_insert_anyone" ON public.qr_scans;
CREATE POLICY "qr_scans_insert_anyone" ON public.qr_scans
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "qr_scans_admin_select" ON public.qr_scans;
CREATE POLICY "qr_scans_admin_select" ON public.qr_scans
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));