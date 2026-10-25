DO $$
DECLARE candidate uuid; slot uuid; alert record;
BEGIN
 SELECT p.applicant_id INTO candidate FROM public.contractor_pipeline p JOIN public.applicants a ON a.id=p.applicant_id WHERE NOT p.archived AND NOT p.is_test AND NOT a.is_test_row LIMIT 1;
 IF candidate IS NULL THEN RAISE EXCEPTION 'No legitimate candidate available for rollback-only verification'; END IF;
 BEGIN
  INSERT INTO public.hiring_slots(kind,starts_at,duration_min,staff,status,applicant_id,booked_at) VALUES('phone','2026-10-29T18:00:00Z',30,'Justin','booked',candidate,now()) RETURNING id INTO slot;
  SELECT * INTO alert FROM public.admin_alerts WHERE context->>'slot_id'=slot::text;
  IF alert.id IS NULL OR alert.tier <> 'urgent' OR NOT alert.night_ok OR alert.context->>'starts_at' IS NULL OR alert.action_url <> '/admin/pipeline/'||candidate THEN RAISE EXCEPTION 'Immediate appointment alert missing'; END IF;
  UPDATE public.hiring_slots SET starts_at='2026-10-29T19:00:00Z' WHERE id=slot;
  IF (SELECT count(*) FROM public.admin_alerts WHERE context->>'slot_id'=slot::text) <> 2 THEN RAISE EXCEPTION 'Reschedule did not create a new alert'; END IF;
  UPDATE public.hiring_slots SET staff='Justin' WHERE id=slot;
  IF (SELECT count(*) FROM public.admin_alerts WHERE context->>'slot_id'=slot::text) <> 2 THEN RAISE EXCEPTION 'Unchanged booking created duplicate alert'; END IF;
  RAISE EXCEPTION USING ERRCODE='Z0001', MESSAGE='Rollback verification rows and queued HTTP requests';
 EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
 END;
END $$;
