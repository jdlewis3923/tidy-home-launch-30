CREATE TABLE public.lawn_plan_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  change_id uuid NOT NULL REFERENCES public.lawn_plan_changes(id) ON DELETE CASCADE,
  kind text NOT NULL, email text NOT NULL, subject text NOT NULL, body text NOT NULL,
  email_status text NOT NULL DEFAULT 'queued', email_error text, sent_at timestamptz
);
GRANT SELECT ON public.lawn_plan_notices TO authenticated;
GRANT ALL ON public.lawn_plan_notices TO service_role;
ALTER TABLE public.lawn_plan_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read lawn plan notices" ON public.lawn_plan_notices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));