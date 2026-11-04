-- Why a candidate must not be auto-declined or auto-nudged right now (NULL = not protected).
CREATE OR REPLACE FUNCTION public.candidate_protection_reason(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.applicants a WHERE a.id=_id AND a.contracts_signed) THEN 'signed agreement'
    WHEN EXISTS (SELECT 1 FROM public.hiring_slots s WHERE s.applicant_id=_id AND s.status='booked' AND s.starts_at > now()-interval '2 days') THEN 'has a booked call/meeting'
    WHEN EXISTS (SELECT 1 FROM public.admin_alerts x WHERE x.alert_type='hiring_unread_reply' AND x.context->>'applicant_id'=_id::text AND (x.resolved_at IS NULL OR x.created_at > now()-interval '7 days')) THEN 'texted us in the last 7 days or has an unread reply'
    WHEN EXISTS (SELECT 1 FROM public.contractor_stage_events e WHERE e.applicant_id=_id AND e.kind='message' AND e.created_at > now()-interval '7 days') THEN 'owner messaged them in the last 7 days'
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.candidate_protection_reason(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_protection_reason(uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.auto_decline_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL,
  attempted_reason text,
  protection text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.auto_decline_blocks TO authenticated;
GRANT ALL ON public.auto_decline_blocks TO service_role;
ALTER TABLE public.auto_decline_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read auto-decline blocks" ON public.auto_decline_blocks FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Automatic silence-declines (decline_reason 'Unresponsive') are refused for protected candidates; the owner decides instead.
CREATE OR REPLACE FUNCTION public.pipeline_protect_auto_decline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE why text; nm text;
BEGIN
  IF NEW.archived AND NOT OLD.archived AND NEW.state='declined' AND NEW.decline_reason='Unresponsive' AND NOT coalesce(NEW.is_test,false) THEN
    why := public.candidate_protection_reason(NEW.applicant_id);
    IF why IS NOT NULL THEN
      INSERT INTO public.auto_decline_blocks(applicant_id,attempted_reason,protection) VALUES(NEW.applicant_id,NEW.archive_reason,why);
      SELECT nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'') INTO nm FROM public.applicants WHERE id=NEW.applicant_id;
      INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,context,action_url,dedupe_key)
      VALUES('auto_decline_blocked','action','hiring','digest',
        'Kept '||coalesce(nm,'a candidate')||' active — your call',
        'The system tried to decline them for '||coalesce(NEW.archive_reason,'silence')||', but they '||why||'. Decide manually.',
        jsonb_build_object('applicant_id',NEW.applicant_id,'attempted',NEW.archive_reason,'protection',why),'/admin/pipeline/'||NEW.applicant_id,
        'auto-decline-blocked:'||NEW.applicant_id||':'||to_char(now(),'YYYY-MM-DD'))
      ON CONFLICT (dedupe_key) DO NOTHING;
      NEW.archived := OLD.archived; NEW.archived_at := OLD.archived_at; NEW.state := OLD.state;
      NEW.archived_from_stage := OLD.archived_from_stage; NEW.archive_reason := OLD.archive_reason; NEW.decline_reason := OLD.decline_reason;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pipeline_protect_auto_decline ON public.contractor_pipeline;
CREATE TRIGGER trg_pipeline_protect_auto_decline BEFORE UPDATE OF archived ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_protect_auto_decline();