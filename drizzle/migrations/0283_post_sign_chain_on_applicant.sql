DROP TRIGGER IF EXISTS trg_contract_signature_post_sign ON public.contract_signatures;
CREATE OR REPLACE FUNCTION public.applicant_contract_signed_chain()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.contracts_signed AND NOT coalesce(OLD.contracts_signed,false) THEN
    PERFORM public.contract_post_sign(NEW.id);
    UPDATE public.contract_signatures s SET pro_number=a.pro_number FROM public.applicants a
     WHERE a.id=NEW.id AND s.applicant_id=NEW.id AND s.pro_number IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_applicant_contract_signed_chain ON public.applicants;
CREATE TRIGGER trg_applicant_contract_signed_chain AFTER UPDATE OF contracts_signed ON public.applicants FOR EACH ROW EXECUTE FUNCTION public.applicant_contract_signed_chain();