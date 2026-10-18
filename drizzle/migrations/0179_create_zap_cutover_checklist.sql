CREATE TABLE public.zap_cutover (
  zap_id text PRIMARY KEY,
  name text NOT NULL,
  zap_state text NOT NULL DEFAULT 'ON',
  app_stage text,
  replacement_note text,
  status text NOT NULL DEFAULT 'shadow' CHECK (status IN ('shadow','ready','zap_off','app_live','retired','blocked')),
  cutover_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zap_cutover TO authenticated;
GRANT ALL ON public.zap_cutover TO service_role;
ALTER TABLE public.zap_cutover ENABLE ROW LEVEL SECURITY;
CREATE POLICY zap_cutover_admin ON public.zap_cutover FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));