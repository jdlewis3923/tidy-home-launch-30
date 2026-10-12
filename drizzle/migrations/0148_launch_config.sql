CREATE TABLE public.launch_config (
  scope text PRIMARY KEY CHECK (scope IN ('cleaning','lawn','car','global')),
  first_visit_date date,
  conversion_date date,
  pro_callback_date date,
  pro_ready_by date,
  late_first_visit_week date,
  hanger_drops jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.launch_config TO anon, authenticated;
GRANT ALL ON public.launch_config TO service_role;
ALTER TABLE public.launch_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Launch dates are public" ON public.launch_config FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.launch_config_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.launch_config_log TO authenticated;
GRANT ALL ON public.launch_config_log TO service_role;
ALTER TABLE public.launch_config_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read launch date changes" ON public.launch_config_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.launch_config (scope, first_visit_date, conversion_date, pro_callback_date, pro_ready_by, late_first_visit_week, hanger_drops) VALUES
 ('cleaning', '2026-11-16', '2026-11-09', '2026-10-26', '2026-11-13', '2026-11-23', '[]'),
 ('lawn',     '2026-11-16', '2026-11-09', '2026-10-26', '2026-11-13', '2026-11-23', '[]'),
 ('car',      '2026-11-30', '2026-11-23', '2026-11-13', '2026-11-25', NULL, '[]'),
 ('global',   NULL, NULL, NULL, NULL, NULL, '[{"start":"2026-11-02","end":"2026-11-04"},{"start":"2026-11-10","end":"2026-11-12"}]');

CREATE OR REPLACE FUNCTION public.admin_set_launch_config(_scope text, _field text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _field NOT IN ('first_visit_date','conversion_date','pro_callback_date','pro_ready_by','late_first_visit_week','hanger_drops') THEN
    RAISE EXCEPTION 'unknown_field';
  END IF;
  EXECUTE format('SELECT (%I)::text FROM public.launch_config WHERE scope = $1', _field) INTO old USING _scope;
  IF _field = 'hanger_drops' THEN
    UPDATE public.launch_config SET hanger_drops = _value::jsonb, updated_at = now(), updated_by = auth.uid() WHERE scope = _scope;
  ELSE
    EXECUTE format('UPDATE public.launch_config SET %I = $1::date, updated_at = now(), updated_by = $2 WHERE scope = $3', _field)
      USING nullif(_value, ''), auth.uid(), _scope;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_scope'; END IF;
  INSERT INTO public.launch_config_log (scope, field, old_value, new_value, changed_by) VALUES (_scope, _field, old, _value, auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.admin_set_launch_config(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_launch_config(text, text, text) TO authenticated;

-- Scheduler start dates now come from launch_config, per service.
CREATE OR REPLACE FUNCTION public.sched_launch_date() RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT min(first_visit_date) FROM public.launch_config WHERE scope IN ('cleaning','lawn')
$$;
CREATE OR REPLACE FUNCTION public.sched_launch_date(_s public.service_type) RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT first_visit_date FROM public.launch_config
   WHERE scope = CASE WHEN _s::text = 'detailing' THEN 'car' ELSE _s::text END
$$;
GRANT EXECUTE ON FUNCTION public.sched_launch_date(public.service_type) TO authenticated, service_role;

-- Point the slot finders at the per-service start date.
DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('sched_first_date','sched_dates','sched_find_slot') LOOP
    def := pg_get_functiondef(r.oid);
    IF r.proname = 'sched_first_date' THEN
      def := replace(def, 'public.sched_launch_date()', 'public.sched_launch_date(c.service)');
    ELSE
      def := replace(def, 'public.sched_launch_date()', 'public.sched_launch_date(_s)');
    END IF;
    EXECUTE def;
  END LOOP;
END $$;

-- Hard guard: no car care visit (Shine Complete or the Car Wash Add-On) before car care's first-visit date.
CREATE OR REPLACE FUNCTION public.launch_visit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first date;
BEGIN
  IF coalesce(NEW.is_sample, false) OR NEW.visit_date IS NULL OR NEW.status::text IN ('canceled','skipped') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.visit_date IS NOT DISTINCT FROM OLD.visit_date THEN RETURN NEW; END IF;
  IF NEW.service_type::text = 'detailing' OR NEW.service::text = 'detailing' OR coalesce(NEW.visit_kind,'') IN ('car_wash','maintenance_wash','full_detail') THEN
    first := public.sched_launch_date('detailing'::public.service_type);
  ELSE
    first := public.sched_launch_date(NEW.service_type);
  END IF;
  IF first IS NOT NULL AND NEW.visit_date < first THEN
    RAISE EXCEPTION 'before_launch' USING DETAIL = format('This service starts %s.', first);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_launch_guard BEFORE INSERT OR UPDATE OF visit_date ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.launch_visit_guard();

-- Conversion gate used by checkout: true when this service may convert to paid today (Miami time).
CREATE OR REPLACE FUNCTION public.launch_conversion_open(_scope text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT (now() AT TIME ZONE 'America/New_York')::date >= conversion_date FROM public.launch_config WHERE scope = _scope), true)
$$;
GRANT EXECUTE ON FUNCTION public.launch_conversion_open(text) TO anon, authenticated, service_role;