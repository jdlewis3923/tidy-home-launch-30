CREATE OR REPLACE FUNCTION public.kpi_latest_snapshots(_codes text[] DEFAULT NULL)
RETURNS TABLE (kpi_code text, status public.kpi_status, value numeric, value_text text, computed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.kpi_code, s.status, s.value, s.value_text, s.computed_at
  FROM (SELECT d.code FROM public.kpi_definitions d
         WHERE (_codes IS NULL OR d.code = ANY(_codes))) c
  CROSS JOIN LATERAL (
    SELECT ks.kpi_code, ks.status, ks.value, ks.value_text, ks.computed_at
    FROM public.kpi_snapshots ks
    WHERE ks.kpi_code = c.code
    ORDER BY ks.computed_at DESC LIMIT 1
  ) s
  WHERE public.is_service_caller() OR public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.kpi_latest_snapshots(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_latest_snapshots(text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kpi_snapshots_prune()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_service_caller() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.kpi_snapshots WHERE id IN (
    SELECT id FROM public.kpi_snapshots WHERE computed_at < now() - interval '90 days' LIMIT 5000);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.kpi_snapshots_prune() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_snapshots_prune() TO service_role;