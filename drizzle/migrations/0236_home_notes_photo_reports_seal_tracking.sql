-- Member Guide home-care pieces:
-- 1. Persistent home notes: the member writes them once, every Pro visiting
--    that home sees them on every visit.
-- 2. Opted-in photo reports: member flips a switch, and after each completed
--    visit they get a link to the Pro's photos (deleted after 30 days by the
--    existing retention job).
-- 3. Founding seal delivery is tracked per founding home.

CREATE TABLE public.home_notes (
  user_id uuid PRIMARY KEY,
  body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.home_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.home_notes TO authenticated;
GRANT ALL ON public.home_notes TO service_role;
CREATE POLICY "members manage own home notes" ON public.home_notes FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Pros read the note only for a home they have a visit at (today or any assigned visit).
CREATE OR REPLACE FUNCTION public.pro_home_note(_visit uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.visits;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id = _visit;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF NOT (v.assigned_pro_id = auth.uid() OR v.backup_pro_id = auth.uid() OR public.pro_on_cleaning_team_visit(_visit, auth.uid()) OR public.current_user_admin()) THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT body FROM public.home_notes WHERE user_id = v.user_id);
END $$;
REVOKE ALL ON FUNCTION public.pro_home_note(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pro_home_note(uuid) TO authenticated, service_role;

-- Photo report opt-in.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photo_reports_opt_in boolean NOT NULL DEFAULT false;

-- Founding seal delivery tracking.
ALTER TABLE public.founding_grants
  ADD COLUMN IF NOT EXISTS seal_status text NOT NULL DEFAULT 'pending' CHECK (seal_status IN ('pending','shipped','delivered')),
  ADD COLUMN IF NOT EXISTS seal_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.admin_mark_seal(_grant uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('pending','shipped','delivered') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.founding_grants SET seal_status = _status, seal_updated_at = now() WHERE id = _grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'grant_not_found'; END IF;
  INSERT INTO public.founding_audit (grant_id, action, actor, detail)
  VALUES (_grant, 'seal_' || _status, auth.uid(), jsonb_build_object('status', _status));
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_seal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_seal(uuid, text) TO authenticated;