CREATE TABLE public.roadmap_initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  launch_date date NOT NULL,
  extra_dates date[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','building','ready','live','paused')),
  switch_key text NOT NULL UNIQUE,
  switch_on boolean NOT NULL DEFAULT false,
  gate_description text NOT NULL DEFAULT '',
  gate_passed boolean NOT NULL DEFAULT false,
  gate_note text,
  build_prompt text,
  summary text,
  is_template boolean NOT NULL DEFAULT false,
  kickoff_sent_at timestamptz,
  launch_checked_on date,
  launched_at timestamptz,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.roadmap_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES public.roadmap_initiatives(id) ON DELETE CASCADE,
  task text NOT NULL,
  owner text NOT NULL DEFAULT 'Justin' CHECK (owner IN ('Justin','Lovable','Chrome','Pro')),
  lead_days int NOT NULL DEFAULT 0,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  note text,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX roadmap_items_initiative_idx ON public.roadmap_items(initiative_id);
CREATE TABLE public.roadmap_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid REFERENCES public.roadmap_initiatives(id) ON DELETE CASCADE,
  kind text NOT NULL,
  detail text,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roadmap_initiatives, public.roadmap_items TO authenticated;
GRANT SELECT, INSERT ON public.roadmap_events TO authenticated;
GRANT ALL ON public.roadmap_initiatives, public.roadmap_items, public.roadmap_events TO service_role;
ALTER TABLE public.roadmap_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roadmap_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage initiatives" ON public.roadmap_initiatives FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roadmap items" ON public.roadmap_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins read roadmap events" ON public.roadmap_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write roadmap events" ON public.roadmap_events FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Customer code may only ask "is this switch on?" — nothing else is readable.
CREATE OR REPLACE FUNCTION public.feature_enabled(_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT switch_on AND status = 'live' FROM public.roadmap_initiatives WHERE switch_key = _key), false)
$$;
GRANT EXECUTE ON FUNCTION public.feature_enabled(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.roadmap_touch() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.switch_on AND NOT OLD.switch_on THEN NEW.status := 'live'; NEW.launched_at := coalesce(NEW.launched_at, now()); END IF;
  IF NEW.status = 'paused' THEN NEW.switch_on := false; END IF;
  IF NEW.launch_date IS DISTINCT FROM OLD.launch_date THEN NEW.kickoff_sent_at := NULL; NEW.launch_checked_on := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER roadmap_initiatives_touch BEFORE UPDATE ON public.roadmap_initiatives FOR EACH ROW EXECUTE FUNCTION public.roadmap_touch();

CREATE OR REPLACE FUNCTION public.roadmap_item_done() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.done AND NOT coalesce(OLD.done,false) THEN NEW.done_at := now(); END IF;
  IF NOT NEW.done THEN NEW.done_at := NULL; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER roadmap_items_done BEFORE UPDATE ON public.roadmap_items FOR EACH ROW EXECUTE FUNCTION public.roadmap_item_done();