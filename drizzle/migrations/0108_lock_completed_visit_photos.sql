CREATE OR REPLACE FUNCTION public.guard_completed_visit_photos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_visit_id uuid := COALESCE(OLD.visit_id, NEW.visit_id);
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.visits
    WHERE id = target_visit_id AND status = 'complete'
  ) THEN
    RAISE EXCEPTION 'completed_visit_photo_record_locked';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS visit_photos_lock_completed_delete ON public.visit_photos;
CREATE TRIGGER visit_photos_lock_completed_delete
  BEFORE DELETE ON public.visit_photos
  FOR EACH ROW EXECUTE FUNCTION public.guard_completed_visit_photos();

DROP TRIGGER IF EXISTS visit_photos_lock_completed_update ON public.visit_photos;
CREATE TRIGGER visit_photos_lock_completed_update
  BEFORE UPDATE ON public.visit_photos
  FOR EACH ROW EXECUTE FUNCTION public.guard_completed_visit_photos();