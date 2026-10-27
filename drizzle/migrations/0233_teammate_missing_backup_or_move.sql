-- Missing-teammate flow for paired Estate Plus visits: the Lead reports a
-- no-show partner, the owner gets an urgent alert, and the visit is resolved
-- either by a checked backup Pro or a move within 48 hours — with a member
-- text in their language either way.
ALTER TABLE public.visits
  ADD COLUMN IF NOT EXISTS backup_pro_id uuid,
  ADD COLUMN IF NOT EXISTS teammate_missing_at timestamptz;

-- A backup Pro counts as the partner for that one visit (visibility, GPS, pay).
CREATE OR REPLACE FUNCTION public.pro_on_cleaning_team_visit(_visit uuid,_pro uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.visits v LEFT JOIN public.cleaning_teams t ON t.id=v.cleaning_team_id
    WHERE v.id=_visit AND (v.assigned_pro_id=_pro OR v.backup_pro_id=_pro
      OR (v.size_tier=5 AND t.kind='paired_pros' AND t.partner_pro_id=_pro AND t.active)))
$$;
REVOKE ALL ON FUNCTION public.pro_on_cleaning_team_visit(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_on_cleaning_team_visit(uuid,uuid) TO authenticated,service_role;

-- Completion still needs two checked-in people: lead + backup-or-partner.
CREATE OR REPLACE FUNCTION public.cleaning_team_close_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE t public.cleaning_teams; second uuid;
BEGIN
  IF NEW.service::text='cleaning' AND NEW.size_tier=5 AND NEW.status::text='complete' AND OLD.status::text<>'complete' THEN
    IF NEW.cleaning_final_inspection_at IS NULL OR jsonb_array_length(NEW.cleaning_zones)=0 THEN RAISE EXCEPTION 'lead_inspection_and_zones_required'; END IF;
    IF NOT public.cleaning_team_valid(NEW.cleaning_team_id) THEN RAISE EXCEPTION 'team_not_verified'; END IF;
    SELECT * INTO t FROM public.cleaning_teams WHERE id=NEW.cleaning_team_id;
    IF t.kind='paired_pros' THEN
      second := coalesce(NEW.backup_pro_id, t.partner_pro_id);
      IF second IS NULL OR EXISTS(SELECT 1 FROM (VALUES(t.lead_pro_id),(second)) AS members(pro_id)
        WHERE NOT EXISTS(SELECT 1 FROM public.cleaning_team_presence p WHERE p.visit_id=NEW.id AND p.pro_id=members.pro_id AND p.check_in_at IS NOT NULL AND p.check_out_at IS NOT NULL))
      THEN RAISE EXCEPTION 'both_pros_check_out_required'; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Lead reports the partner did not show. Database-first: urgent owner alert.
CREATE OR REPLACE FUNCTION public.pro_report_teammate_missing(_visit uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams;
BEGIN
  SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
  IF NOT FOUND OR v.assigned_pro_id <> auth.uid() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v.service::text <> 'cleaning' OR v.size_tier <> 5 THEN RAISE EXCEPTION 'not_a_team_visit'; END IF;
  IF v.status::text NOT IN ('scheduled','on_the_way','in_progress') THEN RAISE EXCEPTION 'visit_not_open'; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;
  IF t.id IS NULL OR t.kind <> 'paired_pros' OR NOT t.active THEN RAISE EXCEPTION 'not_a_team_visit'; END IF;
  IF v.visit_date > (now() AT TIME ZONE 'America/New_York')::date + 1 THEN RAISE EXCEPTION 'too_early'; END IF;
  UPDATE public.visits SET teammate_missing_at = now() WHERE id = v.id AND teammate_missing_at IS NULL;
  INSERT INTO admin_alerts(alert_type,title,body,context,level,category,tier,dedupe_key,action_url,action_label)
  VALUES('operations_action','Teammate missing — ' || to_char(v.visit_date,'Mon DD'),
    'The Lead on an Estate Plus visit reports their partner did not show. Assign a checked backup or move the visit within 48 hours.',
    jsonb_build_object('visit_id',v.id,'team_id',v.cleaning_team_id,'visit_date',v.visit_date),
    'critical','operations','urgent','teammate-missing:'||v.id::text,'/admin/teams','Resolve team')
  ON CONFLICT(dedupe_key) DO NOTHING;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.pro_report_teammate_missing(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.pro_report_teammate_missing(uuid) TO authenticated;

-- Owner resolves: checked backup for the same visit, or move within 48 hours.
CREATE OR REPLACE FUNCTION public.admin_resolve_teammate_missing(_visit uuid, _resolution text, _backup_pro uuid DEFAULT NULL, _new_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.visits; t public.cleaning_teams; b record; backup_name text; lead_name text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v FROM public.visits WHERE id=_visit FOR UPDATE;
  IF NOT FOUND OR v.teammate_missing_at IS NULL THEN RAISE EXCEPTION 'no_missing_report'; END IF;
  SELECT * INTO t FROM public.cleaning_teams WHERE id=v.cleaning_team_id;

  IF _resolution = 'backup' THEN
    IF _backup_pro IS NULL THEN RAISE EXCEPTION 'backup_required'; END IF;
    -- Checked backup: active cleaning Pro, never a test record, not already on this team.
    SELECT c.user_id, c.full_name INTO b FROM public.contractors c
    WHERE c.user_id = _backup_pro AND c.service::text = 'cleaning' AND c.status::text = 'active'
      AND NOT coalesce(c.is_test,false) AND c.user_id NOT IN (t.lead_pro_id, t.partner_pro_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'backup_not_eligible'; END IF;
    UPDATE public.visits SET backup_pro_id = _backup_pro, teammate_missing_at = NULL WHERE id = v.id;
    SELECT full_name INTO lead_name FROM public.contractors WHERE user_id = t.lead_pro_id;
    PERFORM public.sched_customer_notice(v.user_id, 'team_backup', 'Your Tidy team today',
      format('A change to your team: %s will be joined by %s today. Same time, same checklist.', lead_name, b.full_name),
      'team-backup-' || v.id, v.id,
      format('Tidy: a change to your team today — %s will be joined by %s. Same time, same checklist.', lead_name, b.full_name), now() + interval '1 day');
    PERFORM public.sched_pro_notice(_backup_pro, 'backup_assigned', 'You are the backup today',
      format('You are covering an Estate Plus visit today in %s with %s. Check in with GPS as usual.', v.zip, lead_name),
      'backup-' || v.id, '/pro', NULL);
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