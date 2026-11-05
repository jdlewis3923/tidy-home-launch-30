CREATE TABLE public.jobber_service_pros (
  service_line text PRIMARY KEY,
  connecteam_user_id bigint,
  pro_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobber_service_pros TO authenticated;
GRANT ALL ON public.jobber_service_pros TO service_role;
ALTER TABLE public.jobber_service_pros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage service pros" ON public.jobber_service_pros FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.jobber_service_pros(service_line, connecteam_user_id, pro_name) VALUES
  ('cleaning', 31157941, 'Susan Horn'), ('lawn', NULL, NULL), ('detailing', NULL, NULL);

CREATE TABLE public.jobber_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jobber_visit_id text NOT NULL UNIQUE,
  jobber_job_id text,
  subscription_id uuid,
  user_id uuid,
  service_line text,
  size_tier smallint,
  visit_kind text,
  title text,
  start_at timestamptz,
  end_at timestamptz,
  address text,
  customer_first_name text,
  status text NOT NULL DEFAULT 'scheduled',
  connecteam_shift_id text,
  connecteam_user_id bigint,
  report_submission_id text UNIQUE,
  before_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  after_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist_done boolean,
  locked_up boolean,
  issues text,
  completed_at timestamptz,
  customer_emailed_at timestamptz,
  no_report_alerted_at timestamptz,
  pro_pay_cents integer,
  is_test boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.jobber_visits TO authenticated;
GRANT ALL ON public.jobber_visits TO service_role;
ALTER TABLE public.jobber_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read jobber visits" ON public.jobber_visits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX jobber_visits_start_idx ON public.jobber_visits(start_at);

CREATE TABLE public.pro_payout_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jobber_visit_id text NOT NULL UNIQUE,
  connecteam_user_id bigint,
  pro_name text,
  service_line text,
  completed_on date NOT NULL,
  week_start date NOT NULL,
  payout_friday date NOT NULL,
  pay_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'owed',
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.pro_payout_lines TO authenticated;
GRANT ALL ON public.pro_payout_lines TO service_role;
ALTER TABLE public.pro_payout_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read payout lines" ON public.pro_payout_lines FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update payout lines" ON public.pro_payout_lines FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Stop the website engine from creating its own visits for Jobber-scheduled plans.
CREATE OR REPLACE FUNCTION public.visits_jobber_owned_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.jobber_visit_id IS NULL AND NEW.subscription_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.subscriptions s WHERE s.id = NEW.subscription_id
      AND s.jobber_job_ids IS NOT NULL AND s.jobber_job_ids <> '{}'::jsonb AND s.jobber_job_ids <> '[]'::jsonb
  ) THEN
    INSERT INTO public.integration_logs(source, event, status, error_message)
    VALUES ('jobber', 'visit_engine_skipped', 'warning', 'Jobber owns the schedule for subscription ' || NEW.subscription_id);
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_visits_00_jobber_owned BEFORE INSERT ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.visits_jobber_owned_guard();

-- Any plan change pushes to Jobber.
CREATE OR REPLACE FUNCTION public.subscriptions_jobber_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.plan_lines IS DISTINCT FROM OLD.plan_lines
     OR NEW.cadence IS DISTINCT FROM OLD.cadence OR NEW.size_tier IS DISTINCT FROM OLD.size_tier
     OR NEW.car_wash_key IS DISTINCT FROM OLD.car_wash_key OR NEW.pause_collection IS DISTINCT FROM OLD.pause_collection
     OR NEW.paused_until IS DISTINCT FROM OLD.paused_until THEN
    PERFORM public.call_edge_function('jobber-sync', jsonb_build_object('action','sync_subscription','subscription_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscriptions_jobber_push AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_jobber_push();