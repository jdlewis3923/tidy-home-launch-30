CREATE OR REPLACE FUNCTION public.sched_pro_active(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT p.stage = 'active' AND public.pipeline_pro_assignable(a.id)
    FROM public.applicants a JOIN public.contractor_pipeline p ON p.applicant_id = a.id
    WHERE a.contractor_id = _uid ORDER BY a.created_at DESC LIMIT 1), false)
$$;
REVOKE ALL ON FUNCTION public.sched_pro_active(uuid) FROM PUBLIC, anon, authenticated;