CREATE TABLE public.onboarding_module (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  section_number int NOT NULL DEFAULT 0,
  title text NOT NULL,
  body_md text NOT NULL DEFAULT '',
  service_scope text NOT NULL DEFAULT 'all' CHECK (service_scope IN ('all','house_clean','car_wash','car_detail')),
  required boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.onboarding_module TO authenticated;
GRANT ALL ON public.onboarding_module TO service_role;

ALTER TABLE public.onboarding_module ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage onboarding modules"
  ON public.onboarding_module FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read onboarding modules"
  ON public.onboarding_module FOR SELECT TO authenticated
  USING (true);

CREATE INDEX onboarding_module_sort_idx ON public.onboarding_module (sort_order, section_number);
CREATE INDEX onboarding_module_scope_idx ON public.onboarding_module (service_scope);

CREATE TABLE public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pro_id uuid NOT NULL,
  module_slug text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pro_id, module_slug)
);

GRANT SELECT, INSERT, DELETE ON public.onboarding_progress TO authenticated;
GRANT ALL ON public.onboarding_progress TO service_role;

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage onboarding progress"
  ON public.onboarding_progress FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Pros read their own onboarding progress"
  ON public.onboarding_progress FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.applicants a
    WHERE a.id = onboarding_progress.pro_id
      AND a.contractor_id = auth.uid()
  ));

CREATE POLICY "Pros mark their own modules complete"
  ON public.onboarding_progress FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.applicants a
    WHERE a.id = onboarding_progress.pro_id
      AND a.contractor_id = auth.uid()
  ));

CREATE INDEX onboarding_progress_pro_idx ON public.onboarding_progress (pro_id);
CREATE INDEX onboarding_progress_slug_idx ON public.onboarding_progress (module_slug);
