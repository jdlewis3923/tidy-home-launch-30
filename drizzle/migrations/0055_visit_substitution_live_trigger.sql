-- The substitution notice used to hang off the retired pro_visits table.
-- Move it to the live visits table (assigned_pro_id changes).
CREATE OR REPLACE FUNCTION public.visits_notify_pro_substitution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.assigned_pro_id IS NOT DISTINCT FROM OLD.assigned_pro_id
     OR OLD.assigned_pro_id IS NULL
     OR NEW.assigned_pro_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.status, 'scheduled') NOT IN ('scheduled', 'on_the_way') THEN
    RETURN NEW;
  END IF;

  PERFORM public.call_edge_function('notify-pro-substitution', jsonb_build_object(
    'visit_id', NEW.id,
    'old_contractor_id', OLD.assigned_pro_id,
    'new_contractor_id', NEW.assigned_pro_id,
    'scheduled_at', NEW.scheduled_start
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_notify_pro_substitution ON public.visits;
CREATE TRIGGER trg_visits_notify_pro_substitution
AFTER UPDATE OF assigned_pro_id ON public.visits
FOR EACH ROW EXECUTE FUNCTION public.visits_notify_pro_substitution();
