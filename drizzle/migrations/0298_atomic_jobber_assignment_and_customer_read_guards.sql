CREATE OR REPLACE FUNCTION public.assign_jobber_visit_pro(_visit uuid, _override bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.jobber_visits; chosen bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('jobber-pro-assignment',0));
  SELECT * INTO v FROM public.jobber_visits WHERE id=_visit FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'visit not found'; END IF;
  IF v.is_test THEN chosen:=31157330;
  ELSE
    SELECT p.connecteam_user_id INTO chosen FROM public.jobber_service_pro_pool p
    WHERE p.active AND p.service_line=v.service_line
    AND NOT EXISTS(SELECT 1 FROM public.jobber_visits b WHERE b.id<>v.id AND b.deleted_at IS NULL
      AND b.connecteam_user_id=p.connecteam_user_id AND b.start_at<greatest(v.end_at,v.start_at+interval '1 minute')
      AND greatest(b.end_at,b.start_at+interval '1 minute')>v.start_at)
    ORDER BY p.priority,p.id LIMIT 1;
  END IF;
  UPDATE public.jobber_visits SET connecteam_user_id=chosen WHERE id=_visit;
  RETURN chosen;
END $$;
REVOKE EXECUTE ON FUNCTION public.assign_jobber_visit_pro(uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_jobber_visit_pro(uuid,bigint) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_route_households(_from date, _to date)
RETURNS TABLE(pro_id uuid, pro_name text, visit_date date, homes integer, visits integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH assignment AS (
 SELECT v.assigned_pro_id pro,v.visit_date d,v.user_id,v.id FROM public.visits v
 WHERE v.visit_date BETWEEN _from AND _to AND v.status::text NOT IN ('canceled','skipped') AND NOT v.is_sample AND v.assigned_pro_id IS NOT NULL
 AND (v.subscription_id IS NULL OR NOT public.subscription_jobber_owned(v.subscription_id))
 UNION ALL
 SELECT coalesce(v.backup_pro_id,t.partner_pro_id),v.visit_date,v.user_id,v.id FROM public.visits v JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id
 WHERE v.visit_date BETWEEN _from AND _to AND v.status::text NOT IN ('canceled','skipped') AND NOT v.is_sample AND coalesce(v.backup_pro_id,t.partner_pro_id) IS NOT NULL
 AND (v.subscription_id IS NULL OR NOT public.subscription_jobber_owned(v.subscription_id))
)
SELECT a.pro,(SELECT concat_ws(' ',ap.first_name,ap.last_name) FROM public.applicants ap WHERE ap.contractor_id=a.pro ORDER BY ap.created_at DESC LIMIT 1),a.d,count(DISTINCT a.user_id)::integer,count(*)::integer
FROM assignment a WHERE public.current_user_admin() GROUP BY a.pro,a.d ORDER BY a.d,a.pro;
$$;
DO $guard$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef('public.member_ops_tick()'::regprocedure) INTO body;
 body:=replace(body, 'WHERE visit_kind = ''car_wash'' AND visit_date = today + 1 AND status::text = ''scheduled''', 'WHERE visit_kind = ''car_wash'' AND visit_date = today + 1 AND status::text = ''scheduled'' AND (subscription_id IS NULL OR NOT public.subscription_jobber_owned(subscription_id))');
 EXECUTE body;
END $guard$;