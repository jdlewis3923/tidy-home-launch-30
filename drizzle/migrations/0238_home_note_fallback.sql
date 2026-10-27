-- A home note falls back to the member's existing "notes for your Pro" so
-- nothing members already wrote is lost.
CREATE OR REPLACE FUNCTION public.pro_home_note(_visit uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT (v.assigned_pro_id = auth.uid() OR v.backup_pro_id = auth.uid() OR public.pro_on_cleaning_team_visit(_visit, auth.uid()) OR public.current_user_admin()) THEN
    RETURN NULL;
  END IF;
  RETURN coalesce(
    NULLIF((SELECT body FROM public.home_notes WHERE user_id = v.user_id), ''),
    NULLIF((SELECT special_instructions FROM public.profiles WHERE user_id = v.user_id), ''));
END $$;
REVOKE ALL ON FUNCTION public.pro_home_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_home_note(uuid) TO authenticated, service_role;