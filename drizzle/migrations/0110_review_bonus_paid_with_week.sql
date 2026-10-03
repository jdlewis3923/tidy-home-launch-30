CREATE OR REPLACE FUNCTION public.payout_week_mark_bonuses_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status = 'paid' AND COALESCE(OLD.status,'') <> 'paid' THEN
    UPDATE public.pro_bonuses SET status = 'paid', paid_at = COALESCE(NEW.paid_at, now())
     WHERE payout_week_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payout_week_mark_bonuses_paid ON public.payout_weeks;
CREATE TRIGGER trg_payout_week_mark_bonuses_paid AFTER UPDATE OF status ON public.payout_weeks
  FOR EACH ROW EXECUTE FUNCTION public.payout_week_mark_bonuses_paid();