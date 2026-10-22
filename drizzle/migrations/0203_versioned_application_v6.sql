ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS application_version integer NOT NULL DEFAULT 5;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS application_version integer NOT NULL DEFAULT 5;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS apply_question_ids uuid[];
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS application_report jsonb;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS application_disqualify_at timestamptz;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS application_disqualify_handled_at timestamptz;
ALTER TABLE public.contractor_pipeline ADD COLUMN IF NOT EXISTS application_owner_notes text;
UPDATE public.contractor_pipeline p SET apply_question_ids=(SELECT array_agg(q.id ORDER BY q.section,q.sort) FROM public.question_bank q WHERE q.active AND q.service IN ('all',p.service)) WHERE p.apply_question_ids IS NULL AND NOT p.archived AND NOT p.is_test;
CREATE OR REPLACE FUNCTION public.hiring_application_v6_tick() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r record; n integer:=0;
BEGIN
 FOR r IN SELECT applicant_id,stage FROM public.contractor_pipeline WHERE application_disqualify_at<=now() AND application_disqualify_handled_at IS NULL AND NOT archived AND NOT is_test FOR UPDATE SKIP LOCKED LOOP
  PERFORM set_config('tidy.pipeline_move','on',true);
  UPDATE public.contractor_pipeline SET archived=true,archived_at=now(),archived_from_stage=stage,state='declined',archive_reason='application_not_fit',decline_reason='Not a fit right now: vehicle or work authorization',application_disqualify_handled_at=now() WHERE applicant_id=r.applicant_id;
  UPDATE public.hiring_deadlines SET resolved_at=now() WHERE applicant_id=r.applicant_id AND resolved_at IS NULL;
  PERFORM public.call_edge_function('pipeline-notify',jsonb_build_object('applicant_id',r.applicant_id,'event','v6_not_fit'));
  n:=n+1;
 END LOOP;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.hiring_application_v6_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hiring_application_v6_tick() TO service_role;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='hiring_tick'; IF position('PERFORM public.hiring_application_v6_tick();' in d)=0 THEN d:=replace(d,'PERFORM public.hire_ready_tick();','PERFORM public.hire_ready_tick();' || chr(10) || '  PERFORM public.hiring_application_v6_tick();'); EXECUTE d; END IF; END $$;
CREATE OR REPLACE FUNCTION public.admin_application_report(_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.contractor_pipeline;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 SELECT * INTO p FROM public.contractor_pipeline WHERE applicant_id=_id;
 IF p.application_version=6 THEN RETURN p.application_report; END IF;
 RETURN public.hiring_fit_report(_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_application_report(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_application_report(uuid) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.admin_application_note(_id uuid,_note text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 UPDATE public.contractor_pipeline SET application_owner_notes=left(_note,20000) WHERE applicant_id=_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_application_note(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_application_note(uuid,text) TO authenticated,service_role;