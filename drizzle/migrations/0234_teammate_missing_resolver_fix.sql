-- Fix admin_resolve_teammate_missing: Pro roster lives in applicants/
-- sched_pro_* helpers (there is no contractors table), and sched_pro_notice
-- takes (_pro,_kind,_title,_body,_url,_dedupe).
CREATE OR REPLACE FUNCTION public.admin_resolve_teammate_missing(_visit uuid, _resolution text, _backup_pro uuid DEFAULT NULL, _new_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; backup_name text; lead_name text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
  IF NOT FOUND OR v.teammate_missing_at IS NULL THEN RAISE EXCEPTION 'no_missing_report'; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;

  IF _resolution = 'backup' THEN
    IF _backup_pro IS NULL THEN RAISE EXCEPTION 'backup_required'; END IF;
    -- Checked backup: active cleaning Pro, never a test record, not already on this team.
    IF NOT public.sched_pro_active(_backup_pro)
       OR NOT ('cleaning'::public.service_type = ANY(public.sched_pro_services(_backup_pro)))
       OR EXISTS(SELECT 1 FROM public.applicants WHERE contractor_id = _backup_pro AND coalesce(is_test_row,false))
       OR _backup_pro IN (t.lead_pro_id, t.partner_pro_id)
    THEN RAISE EXCEPTION 'backup_not_eligible'; END IF;
    UPDATE public.visits SET backup_pro_id = _backup_pro, teammate_missing_at = NULL WHERE id = v.id;
    SELECT concat_ws(' ', a.first_name, a.last_name) INTO backup_name FROM public.applicants a WHERE a.contractor_id = _backup_pro ORDER BY a.created_at DESC LIMIT 1;
    SELECT concat_ws(' ', a.first_name, a.last_name) INTO lead_name FROM public.applicants a WHERE a.contractor_id = t.lead_pro_id ORDER BY a.created_at DESC LIMIT 1;
    PERFORM public.sched_customer_notice(v.user_id, 'team_backup', 'Your Tidy team today',
      format('A change to your team: %s will be joined by %s today. Same time, same checklist.', lead_name, backup_name),
      'team-backup-' || v.id, v.id,
      format('Tidy: a change to your team today — %s will be joined by %s. Same time, same checklist.', lead_name, backup_name), now() + interval '1 day');
    PERFORM public.sched_pro_notice(_backup_pro, 'backup_assigned', 'You are the backup today',
      format('You are covering an Estate Plus visit today in %s with %s. Check in with GPS as usual.', v.zip, lead_name),
      '/pro', 'backup-' || v.id);
  ELSIF _resolution = 'move' THEN
    IF _new_date IS NULL OR _new_date < v.visit_date OR _new_date > v.visit_date + 2 THEN RAISE EXCEPTION 'move_window_48h'; END IF;
    PERFORM public.sched_move_visit(v.id, _new_date, v.window_key, 'teammate_missing');
    UPDATE public.visits SET teammate_missing_at = NULL WHERE id = v.id;
    PERFORM public.sched_customer_notice(v.user_id, 'visit_moved', 'We moved your visit',
      format('One of your Pros could not make it, so we moved your visit to %s — same team, same window. Reply if that day does not work.', to_char(_new_date,'FMDay, Mon DD')),
      'team-move-' || v.id, v.id,
      format('Tidy: one of your Pros could not make it, so we moved your visit to %s — same team, same window. Reply if that day does not work.', to_char(_new_date,'FMDay, Mon DD')), now() + interval '2 days');
  ELSE
    RAISE EXCEPTION 'invalid_resolution';
  END IF;

  UPDATE public.admin_alerts SET resolved_at = now() WHERE dedupe_key = 'teammate-missing:' || v.id::text AND resolved_at IS NULL;
  RETURN jsonb_build_object('ok',true,'resolution',_resolution);
END $$;
REVOKE ALL ON FUNCTION public.admin_resolve_teammate_missing(uuid,text,uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_teammate_missing(uuid,text,uuid,date) TO authenticated;