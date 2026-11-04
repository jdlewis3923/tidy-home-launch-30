-- One phone → one candidate: prefer the master record, never a merged duplicate.
CREATE OR REPLACE FUNCTION public.match_applicant_by_phone(_phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.id FROM public.applicants a
  LEFT JOIN public.contractor_pipeline p ON p.applicant_id=a.id
  WHERE right(regexp_replace(coalesce(a.phone,''),'\D','','g'),10) = right(regexp_replace(coalesce(_phone,''),'\D','','g'),10)
    AND length(regexp_replace(coalesce(_phone,''),'\D','','g')) >= 10
  ORDER BY (coalesce(p.archive_reason,'') ILIKE 'duplicate of%') ASC,
           (coalesce(p.archived,false)) ASC,
           coalesce(a.contracts_signed,false) DESC,
           (p.proof_approved_at IS NOT NULL) DESC,
           a.created_at ASC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.match_applicant_by_phone(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_applicant_by_phone(text) TO service_role;

-- Any candidate reply still unread after 24 hours becomes urgent (one per candidate, newest message).
-- Applies to replies received from Nov 4 2026 onward; the older backlog is reported to the owner, not re-sent as texts.
CREATE OR REPLACE FUNCTION public.escalate_stale_unread_replies()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (context->>'applicant_id') id FROM public.admin_alerts
     WHERE alert_type='hiring_unread_reply' AND resolved_at IS NULL AND coalesce(tier,'digest')<>'urgent'
       AND created_at < now()-interval '24 hours' AND created_at >= '2026-11-04'
       AND coalesce((context->>'is_test')::boolean,false)=false
     ORDER BY context->>'applicant_id', created_at DESC)
  UPDATE public.admin_alerts a SET tier='urgent', notified_at=NULL,
         title='No reply in 24h+: '||regexp_replace(a.title,'^No reply in 24h\+: ','')
    FROM latest WHERE a.id=latest.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.escalate_stale_unread_replies() FROM PUBLIC, anon, authenticated;