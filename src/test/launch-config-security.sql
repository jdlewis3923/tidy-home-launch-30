-- Run as the privileged test connection. All writes are rolled back.
BEGIN;
DO $test$
DECLARE
  admin_id uuid;
  non_admin_id uuid := gen_random_uuid();
  original_date date;
  next_date date := DATE '2026-12-07';
  saved_date date;
  log_count bigint;
BEGIN
  SELECT user_id INTO admin_id FROM public.user_roles WHERE role='admin' LIMIT 1;
  IF admin_id IS NULL THEN RAISE EXCEPTION 'An existing admin is required for this test'; END IF;
  IF has_function_privilege('anon','public.admin_set_launch_config(text,text,text)','execute') THEN
    RAISE EXCEPTION 'Anonymous execution must be denied';
  END IF;
  SELECT pro_ready_by INTO original_date FROM public.launch_config WHERE scope='cleaning';
  SELECT count(*) INTO log_count FROM public.launch_config_log;

  PERFORM set_config('request.jwt.claim.sub',non_admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',non_admin_id,'role','authenticated')::text,true);
  PERFORM set_config('role','authenticated',true);
  BEGIN
    PERFORM public.admin_set_launch_config('cleaning','pro_ready_by',next_date::text);
    RAISE EXCEPTION 'Non-admin write unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  BEGIN
    PERFORM public.admin_set_launch_config('cleaning','first_visit_date; DROP TABLE public.launch_config; --',next_date::text);
    RAISE EXCEPTION 'Unapproved field unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'unknown_field' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_set_launch_config('cleaning',NULL,next_date::text);
    RAISE EXCEPTION 'Missing field unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'unknown_field' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_set_launch_config('cleaning'' OR true --','pro_ready_by',next_date::text);
    RAISE EXCEPTION 'Caller-shaped scope unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'unknown_scope' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admin_set_launch_config('cleaning','pro_ready_by','2026-12-07''; SELECT 1; --');
    RAISE EXCEPTION 'Invalid typed value unexpectedly succeeded';
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN NULL;
  END;

  -- Use a field that does not trigger social replanning or contact anyone.
  PERFORM public.admin_set_launch_config('cleaning','pro_ready_by',next_date::text);
  SELECT pro_ready_by INTO saved_date FROM public.launch_config WHERE scope='cleaning';
  IF saved_date IS DISTINCT FROM next_date THEN RAISE EXCEPTION 'Admin save did not read back'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.launch_config_log WHERE scope='cleaning' AND field='pro_ready_by'
    AND old_value IS NOT DISTINCT FROM original_date::text AND new_value=next_date::text AND changed_by=admin_id) THEN
    RAISE EXCEPTION 'Admin change audit is missing';
  END IF;
  PERFORM public.admin_set_launch_config('cleaning','pro_ready_by','');
  SELECT pro_ready_by INTO saved_date FROM public.launch_config WHERE scope='cleaning';
  IF saved_date IS NOT NULL THEN RAISE EXCEPTION 'Admin cannot clear an optional date'; END IF;
  IF (SELECT count(*) FROM public.launch_config_log) <> log_count+2 THEN
    RAISE EXCEPTION 'Rejected writes must not produce audit entries';
  END IF;
END $test$;
ROLLBACK;