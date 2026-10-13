-- G2 backstop: hour changes (claim or "Save hours") must stay full-day until custom hours are allowed.
CREATE OR REPLACE FUNCTION public.sched_claim_hours_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record;
BEGIN
  IF public.sched_custom_hours_allowed(NEW.service) THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.sched_full_day(NEW.service);
  IF NEW.start_time <> f.start_t OR NEW.end_time <> f.end_t
     OR (NEW.pending_start IS NOT NULL AND (NEW.pending_start <> f.start_t OR NEW.pending_end <> f.end_t)) THEN
    RAISE EXCEPTION 'full_day_required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sched_claim_hours_guard ON public.pro_day_claims;
CREATE TRIGGER trg_sched_claim_hours_guard BEFORE INSERT OR UPDATE OF start_time, end_time, pending_start, pending_end ON public.pro_day_claims
  FOR EACH ROW EXECUTE FUNCTION public.sched_claim_hours_guard();