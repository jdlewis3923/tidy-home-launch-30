CREATE OR REPLACE FUNCTION public.pro_all_five(_applicant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT a.bg_check_status = 'clear'
       AND a.coi_review_status IN ('approved','verified')
       AND a.contracts_signed IS TRUE
       AND EXISTS (SELECT 1 FROM public.pro_kit k WHERE k.applicant_id = a.id
                    AND (k.status IN ('submitted','kit_ordered','kit_issued') OR k.submitted_at IS NOT NULL))
       AND EXISTS (SELECT 1 FROM public.pro_kit k WHERE k.applicant_id = a.id AND k.badge_photo_status = 'approved')
    FROM public.applicants a WHERE a.id = _applicant_id), false);
$$;
REVOKE ALL ON FUNCTION public.pro_all_five(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pro_all_five(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_pro_all_set_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE app uuid;
BEGIN
  app := CASE WHEN TG_TABLE_NAME = 'applicants' THEN NEW.id ELSE NEW.applicant_id END;
  IF app IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.applicants WHERE id = app AND all_set_sent_at IS NULL)
     AND public.pro_all_five(app) THEN
    PERFORM public.call_edge_function('pro-all-set', jsonb_build_object('applicant_id', app));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_applicants_all_set ON public.applicants;
CREATE TRIGGER trg_applicants_all_set AFTER UPDATE OF bg_check_status, coi_review_status, contracts_signed ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.trg_pro_all_set_check();
DROP TRIGGER IF EXISTS trg_kit_all_set ON public.pro_kit;
CREATE TRIGGER trg_kit_all_set AFTER UPDATE OF status, submitted_at, badge_photo_status ON public.pro_kit
  FOR EACH ROW EXECUTE FUNCTION public.trg_pro_all_set_check();