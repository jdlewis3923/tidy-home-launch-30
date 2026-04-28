
-- Operations cost tracking tables
CREATE TABLE public.cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('marketing','contractor','saas','other')),
  subcategory text,
  vendor text,
  description text NOT NULL,
  amount_cents integer NOT NULL,
  spent_on date NOT NULL DEFAULT (now()::date),
  -- contractor-specific
  contractor_name text,
  service_type text,
  jobber_job_id text,
  jobber_visit_id text,
  is_bonus boolean NOT NULL DEFAULT false,
  -- marketing-specific
  campaign text,
  channel text,
  -- saas-specific
  billing_cycle text,
  -- meta
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','jobber','stripe','import')),
  external_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE UNIQUE INDEX cost_entries_external_uniq ON public.cost_entries (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX cost_entries_spent_on_idx ON public.cost_entries (spent_on DESC);
CREATE INDEX cost_entries_category_idx ON public.cost_entries (category);

ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cost_entries admin select" ON public.cost_entries FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "cost_entries admin insert" ON public.cost_entries FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "cost_entries admin update" ON public.cost_entries FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY "cost_entries admin delete" ON public.cost_entries FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER cost_entries_set_updated_at
  BEFORE UPDATE ON public.cost_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
