CREATE OR REPLACE FUNCTION public.kpi_latest_snapshot_rows()
RETURNS TABLE (kpi_code text, status public.kpi_status, value numeric, value_text text, context jsonb, computed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.kpi_code, s.status, s.value, s.value_text, s.context, s.computed_at
  FROM public.kpi_definitions d
  CROSS JOIN LATERAL (
    SELECT ks.kpi_code, ks.status, ks.value, ks.value_text, ks.context, ks.computed_at
    FROM public.kpi_snapshots ks WHERE ks.kpi_code = d.code
    ORDER BY ks.computed_at DESC LIMIT 1
  ) s
  WHERE public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.kpi_latest_snapshot_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_latest_snapshot_rows() TO authenticated;