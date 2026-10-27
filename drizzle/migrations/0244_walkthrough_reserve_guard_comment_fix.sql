-- Re-state reserve_cleaning_walkthrough with the approved fail-closed guard
-- (is_privileged_caller); identical behavior, comment wording only.
CREATE OR REPLACE FUNCTION public.reserve_cleaning_walkthrough(_slot uuid, _reservation uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.reservations WHERE id=_reservation AND cleaning_selected_size='custom' AND status<>'canceled') THEN RETURN false; END IF;
  UPDATE public.cleaning_walkthrough_slots SET status='booked', reservation_id=_reservation WHERE id=_slot AND status='open' AND starts_at>now();
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.reservations SET cleaning_walkthrough_slot_id=_slot WHERE id=_reservation;
  RETURN true;
END $$;