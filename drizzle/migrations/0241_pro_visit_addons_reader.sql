-- Pro-scoped read of the add-ons attached to a visit they are working,
-- plus whether the visit is a paired team visit (split allowed).
CREATE OR REPLACE FUNCTION public.pro_visit_addons(_visit uuid)
RETURNS TABLE(id uuid, addon_name text, status text, split_pay boolean, completed_by uuid, can_split boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; me uuid := auth.uid(); paired boolean := false;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND THEN RAISE EXCEPTION 'visit_not_found'; END IF;
  IF v.service::text = 'cleaning' THEN
    IF NOT public.pro_on_cleaning_team_visit(v.id, me) THEN RAISE EXCEPTION 'not_on_visit'; END IF;
    SELECT * INTO t FROM public.cleaning_teams WHERE id = v.cleaning_team_id;
    paired := v.size_tier = 5 AND t.kind = 'paired_pros';
  ELSIF v.assigned_pro_id IS DISTINCT FROM me AND v.backup_pro_id IS DISTINCT FROM me THEN
    RAISE EXCEPTION 'not_on_visit';
  END IF;
  RETURN QUERY
    SELECT a.id, a.addon_name, a.status, a.split_pay, a.completed_by, paired
    FROM public.addon_attaches a
    WHERE a.visit_id = v.id AND a.status IN ('pending_visit','completed')
    ORDER BY a.attached_at;
END $$;
REVOKE ALL ON FUNCTION public.pro_visit_addons(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_visit_addons(uuid) TO authenticated;