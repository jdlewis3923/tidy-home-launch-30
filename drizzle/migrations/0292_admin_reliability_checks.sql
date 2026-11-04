CREATE OR REPLACE FUNCTION public.admin_reliability_checks()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE st record; res jsonb := '[]'::jsonb; n int; oldest timestamptz; x text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT status, created_at, detail INTO st FROM public.integration_logs WHERE event='signing_selftest' ORDER BY created_at DESC LIMIT 1;
  res := res || jsonb_build_object('key','signing_selftest','label','Agreement signing self-test (cleaning, lawn, Spanish)',
    'ok', st.status='success' AND st.created_at > now()-interval '26 hours',
    'detail', CASE WHEN st.created_at IS NULL THEN 'Never run' WHEN st.status<>'success' THEN 'Last run FAILED' WHEN st.created_at <= now()-interval '26 hours' THEN 'No run in the last 26 hours' ELSE 'Passed' END,
    'at', st.created_at);

  SELECT count(*), min(created_at) INTO n, oldest FROM public.admin_alerts
   WHERE alert_type='hiring_unread_reply' AND resolved_at IS NULL AND coalesce((context->>'is_test')::boolean,false)=false;
  res := res || jsonb_build_object('key','unread_replies','label','Candidate replies waiting on you',
    'ok', n=0 OR oldest > now()-interval '24 hours', 'count', n,
    'detail', CASE WHEN n=0 THEN 'None waiting' ELSE n||' unread, oldest '||to_char(oldest AT TIME ZONE 'America/New_York','Mon DD HH12:MI AM') END, 'at', oldest);

  SELECT count(*) INTO n FROM public.onboarding_pack_sends WHERE sms_status='queued' AND release_after < now()-interval '1 hour';
  SELECT n + count(*) INTO n FROM public.sms_outbox WHERE status='queued' AND release_after < now()-interval '1 hour' AND (expires_at IS NULL OR expires_at > now());
  res := res || jsonb_build_object('key','stuck_sends','label','Texts stuck in the queue','ok', n=0,'count',n,
    'detail', CASE WHEN n=0 THEN 'None stuck' ELSE n||' past their send time and still queued' END);

  SELECT count(DISTINCT e.message_sid) INTO n FROM public.sms_delivery_events e
   WHERE e.message_status IN ('failed','undelivered') AND e.received_at > now()-interval '7 days'
     AND NOT EXISTS (SELECT 1 FROM public.sms_delivery_events d WHERE d.message_sid=e.message_sid AND d.message_status='delivered');
  SELECT n + count(*) INTO n FROM public.sms_outbox WHERE status='failed' AND updated_at > now()-interval '7 days';
  res := res || jsonb_build_object('key','failed_sends','label','Texts that failed or were not delivered (7 days)','ok', n=0,'count',n,
    'detail', CASE WHEN n=0 THEN 'None' ELSE n||' failed or undelivered' END);

  SELECT max(received_at) INTO oldest FROM public.sms_delivery_events;
  res := res || jsonb_build_object('key','delivery_receipts','label','Text delivery receipts arriving','ok', oldest > now()-interval '3 hours',
    'detail', CASE WHEN oldest IS NULL THEN 'No receipts recorded yet' ELSE 'Last receipt '||to_char(oldest AT TIME ZONE 'America/New_York','Mon DD HH12:MI AM') END, 'at', oldest);

  WITH k AS (SELECT a.id, lower(trim(a.email)) em, right(regexp_replace(coalesce(a.phone,''),'\D','','g'),10) ph, coalesce(p.service,a.service) sv
     FROM public.applicants a JOIN public.contractor_pipeline p ON p.applicant_id=a.id
    WHERE NOT coalesce(p.is_test,false) AND NOT coalesce(a.is_test_row,false) AND coalesce(p.archive_reason,'') NOT ILIKE 'duplicate%' AND NOT coalesce(p.archived,false))
  SELECT count(*) INTO n FROM k k1 JOIN k k2 ON k1.id<k2.id AND k1.sv=k2.sv
     AND ((k1.em<>'' AND k1.em NOT LIKE 'pending-%' AND k1.em=k2.em) OR (length(k1.ph)=10 AND k1.ph=k2.ph));
  res := res || jsonb_build_object('key','duplicates','label','Duplicate candidate records','ok', n=0,'count',n,
    'detail', CASE WHEN n=0 THEN 'None' ELSE n||' active pair(s) share an email or phone' END);

  SELECT count(*) INTO n FROM public.admin_alerts WHERE alert_type='candidate_failure' AND resolved_at IS NULL AND tier='urgent';
  res := res || jsonb_build_object('key','candidate_failures','label','Errors candidates hit (signing, apply, intake, uploads, booking)','ok', n=0,'count',n,
    'detail', CASE WHEN n=0 THEN 'None open' ELSE n||' open' END);

  SELECT count(*) INTO n FROM public.auto_decline_blocks WHERE created_at > now()-interval '7 days';
  res := res || jsonb_build_object('key','auto_decline_blocks','label','Automatic declines stopped for active candidates (7 days)','ok', true,'count',n,
    'detail', n||' stopped — these need your decision');

  RETURN jsonb_build_object('ok', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(res) e WHERE (e->>'ok')::boolean = false), 'checks', res, 'as_of', now());
END $$;
REVOKE ALL ON FUNCTION public.admin_reliability_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reliability_checks() TO authenticated;