DO $$
DECLARE r record; def text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' AND p.proname IN ('sched_options','sched_generate_booking') LOOP
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'public.sched_launch_date()',
      CASE r.proname WHEN 'sched_options' THEN 'public.sched_launch_date(_s)' ELSE 'public.sched_launch_date(b.service)' END);
    EXECUTE def;
  END LOOP;
END $$;