CREATE OR REPLACE FUNCTION public.signing_day_kit_order_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; BEGIN
 IF NEW.signing_day_mode AND NEW.status IN ('kit_ordered','kit_issued') AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
 s:=public.signing_day_state(NEW.applicant_id);
 IF NOT coalesce((s->>'kit_order_ready')::boolean,false) THEN RAISE EXCEPTION 'Kit ordering waits for verified insurance and completed intake.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER signing_day_kit_insurance_guard BEFORE INSERT OR UPDATE OF status ON public.pro_kit FOR EACH ROW EXECUTE FUNCTION public.signing_day_kit_order_guard();