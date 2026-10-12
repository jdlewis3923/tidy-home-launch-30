CREATE OR REPLACE FUNCTION public.launch_visit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first date; is_car boolean;
BEGIN
  IF coalesce(NEW.is_sample, false) OR NEW.visit_date IS NULL OR NEW.status::text IN ('canceled','skipped') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.visit_date IS NOT DISTINCT FROM OLD.visit_date THEN RETURN NEW; END IF;
  is_car := coalesce(NEW.service::text, '') = 'detailing' OR coalesce(NEW.service_type, '') = 'detailing'
            OR coalesce(NEW.visit_kind, '') IN ('car_wash','maintenance_wash','full_detail');
  SELECT first_visit_date INTO first FROM public.launch_config
   WHERE scope = CASE WHEN is_car THEN 'car' ELSE coalesce(NEW.service::text, NEW.service_type) END;
  IF first IS NOT NULL AND NEW.visit_date < first THEN
    RAISE EXCEPTION 'before_launch' USING DETAIL = format('This service starts %s.', first);
  END IF;
  RETURN NEW;
END $$;