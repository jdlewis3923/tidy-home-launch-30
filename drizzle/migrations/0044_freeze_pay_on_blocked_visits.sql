-- A paid-in-full (blocked) visit has already been credited to the payout ledger,
-- so it is frozen exactly like a completed one: reassignment never reprices it.
CREATE OR REPLACE FUNCTION public.visits_resolve_pay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.completed_at IS NOT NULL OR OLD.status IN ('complete','blocked')) THEN
    NEW.visit_pay_cents := OLD.visit_pay_cents;
    NEW.contractor_pay_cents := OLD.contractor_pay_cents;
    RETURN NEW;
  END IF;
  IF NEW.contractor_pay_cents IS NOT NULL THEN
    NEW.visit_pay_cents := public.pro_tier_uplift_cents(NEW.contractor_pay_cents, NEW.assigned_pro_id);
  END IF;
  RETURN NEW;
END;
$$;