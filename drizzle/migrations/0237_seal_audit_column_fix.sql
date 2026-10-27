-- founding_audit's column is `event`, not `action`.
CREATE OR REPLACE FUNCTION public.admin_mark_seal(_grant uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('pending','shipped','delivered') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.founding_grants SET seal_status = _status, seal_updated_at = now() WHERE id = _grant;
  IF NOT FOUND THEN RAISE EXCEPTION 'grant_not_found'; END IF;
  INSERT INTO public.founding_audit (grant_id, event, actor, detail)
  VALUES (_grant, 'seal_' || _status, auth.uid(), jsonb_build_object('status', _status));
END $$;
REVOKE ALL ON FUNCTION public.admin_mark_seal(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_seal(uuid, text) TO authenticated;