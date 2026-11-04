-- Phones stored as E.164 (+1XXXXXXXXXX) and emails lowercased, on every write path.
CREATE OR REPLACE FUNCTION public.applicant_normalize_contact()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE d text;
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone <> '' THEN
    d := regexp_replace(NEW.phone,'\D','','g');
    IF length(d)=10 THEN NEW.phone := '+1'||d;
    ELSIF length(d)=11 AND left(d,1)='1' THEN NEW.phone := '+'||d;
    END IF;
  END IF;
  IF NEW.email IS NOT NULL THEN NEW.email := lower(trim(NEW.email)); END IF;
  IF NEW.first_name IS NOT NULL THEN NEW.first_name := trim(NEW.first_name); END IF;
  IF NEW.last_name IS NOT NULL THEN NEW.last_name := trim(NEW.last_name); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_applicant_normalize_contact ON public.applicants;
CREATE TRIGGER trg_applicant_normalize_contact BEFORE INSERT OR UPDATE OF phone, email, first_name, last_name ON public.applicants
  FOR EACH ROW EXECUTE FUNCTION public.applicant_normalize_contact();

-- Moves a duplicate application onto the master record and archives the duplicate.
CREATE OR REPLACE FUNCTION public.applicant_merge_duplicate(_dup uuid, _master uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE d public.contractor_pipeline; m public.contractor_pipeline; n_ans int;
BEGIN
  IF _dup = _master THEN RAISE EXCEPTION 'same_record'; END IF;
  SELECT * INTO d FROM public.contractor_pipeline WHERE applicant_id=_dup FOR UPDATE;
  SELECT * INTO m FROM public.contractor_pipeline WHERE applicant_id=_master FOR UPDATE;
  IF d.applicant_id IS NULL OR m.applicant_id IS NULL THEN RAISE EXCEPTION 'pipeline_missing'; END IF;
  IF coalesce(d.is_test,false) <> coalesce(m.is_test,false) THEN RAISE EXCEPTION 'test_mismatch'; END IF;
  INSERT INTO public.application_answers(candidate_id,question_id,value,answered_at)
    SELECT _master,question_id,value,answered_at FROM public.application_answers WHERE candidate_id=_dup
  ON CONFLICT (candidate_id,question_id) DO UPDATE SET value=EXCLUDED.value, answered_at=EXCLUDED.answered_at
    WHERE EXCLUDED.answered_at > public.application_answers.answered_at;
  GET DIAGNOSTICS n_ans = ROW_COUNT;
  UPDATE public.onboarding_events SET applicant_id=_master WHERE applicant_id=_dup;
  UPDATE public.hiring_slots SET applicant_id=_master WHERE applicant_id=_dup;
  UPDATE public.hiring_deadlines SET resolved_at=coalesce(resolved_at,now()) WHERE applicant_id=_dup;
  UPDATE public.admin_alerts SET context=context||jsonb_build_object('applicant_id',_master,'moved_from_duplicate',_dup), action_url='/admin/pipeline/'||_master
   WHERE context->>'applicant_id'=_dup::text;
  PERFORM set_config('tidy.pipeline_move','on',true);
  UPDATE public.contractor_pipeline SET apply_resume_token=NULL, archived=true, archived_at=now(), state='withdrawn',
         archived_from_stage=stage, archive_reason='duplicate of '||left(_master::text,8)
   WHERE applicant_id=_dup;
  UPDATE public.contractor_pipeline SET
    apply_submitted_at=coalesce(d.apply_submitted_at, apply_submitted_at),
    application_report=coalesce(d.application_report, application_report),
    apply_question_ids=CASE WHEN d.apply_submitted_at IS NOT NULL THEN coalesce(d.apply_question_ids, apply_question_ids) ELSE apply_question_ids END,
    application_version=CASE WHEN d.apply_submitted_at IS NOT NULL THEN coalesce(d.application_version, application_version) ELSE application_version END,
    apply_resume_token=coalesce(d.apply_resume_token, apply_resume_token)
   WHERE applicant_id=_master;
  PERFORM public.pipeline_log(_master,'note',m.stage,m.stage,m.state,m.state,'merged duplicate application '||left(_dup::text,8),
    jsonb_build_object('duplicate',_dup,'answers_moved',n_ans));
  PERFORM set_config('tidy.pipeline_move','',true);
  RETURN jsonb_build_object('ok',true,'answers',n_ans);
END $$;
REVOKE ALL ON FUNCTION public.applicant_merge_duplicate(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- When a re-done application is submitted, fold it into the existing open record for the same service.
CREATE OR REPLACE FUNCTION public.applicant_dedupe_on_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE a public.applicants; master uuid;
BEGIN
  IF NEW.apply_submitted_at IS NULL OR OLD.apply_submitted_at IS NOT NULL OR coalesce(NEW.is_test,false) THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.applicants WHERE id=NEW.applicant_id;
  SELECT x.id INTO master FROM public.applicants x JOIN public.contractor_pipeline p ON p.applicant_id=x.id
   WHERE x.id<>a.id AND x.created_at < a.created_at AND NOT coalesce(p.is_test,false) AND NOT coalesce(x.is_test_row,false)
     AND NOT p.archived AND lower(coalesce(p.service,x.service,''))=lower(coalesce(NEW.service,a.service,''))
     AND ((coalesce(a.email,'') NOT LIKE 'pending-%' AND a.email<>'' AND lower(x.email)=lower(a.email))
       OR (length(regexp_replace(coalesce(a.phone,''),'\D','','g'))>=10 AND right(regexp_replace(coalesce(x.phone,''),'\D','','g'),10)=right(regexp_replace(a.phone,'\D','','g'),10)))
   ORDER BY x.created_at ASC LIMIT 1;
  IF master IS NOT NULL THEN
    PERFORM public.applicant_merge_duplicate(a.id, master);
    INSERT INTO public.admin_alerts(alert_type,level,category,tier,title,body,context,action_url,dedupe_key)
    VALUES('applicant_duplicate_merged','info','hiring','digest',
      coalesce(nullif(trim(coalesce(a.first_name,'')||' '||coalesce(a.last_name,'')),''),'A candidate')||' re-applied; merged into the existing record',
      'Answers, report and messages now live on the original record.',jsonb_build_object('applicant_id',master,'duplicate',a.id),'/admin/pipeline/'||master,'dup-merge:'||a.id)
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_applicant_dedupe_on_submit ON public.contractor_pipeline;
CREATE TRIGGER trg_applicant_dedupe_on_submit AFTER UPDATE OF apply_submitted_at ON public.contractor_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.applicant_dedupe_on_submit();