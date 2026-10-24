ALTER TABLE public.hiring_deadlines ADD COLUMN IF NOT EXISTS daily_new_app_reminder boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.new_application_reminder_at(_invited_at timestamptz)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT (((_invited_at AT TIME ZONE 'America/New_York')::date + 1) + time '08:00') AT TIME ZONE 'America/New_York';
$$;
REVOKE ALL ON FUNCTION public.new_application_reminder_at(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.new_application_reminder_at(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.set_new_application_morning_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
 IF NEW.kind <> 'apply' THEN RETURN NEW; END IF;
 SELECT ap.created_at, ap.first_texted_at INTO a FROM public.applicants ap
 JOIN public.contractor_pipeline p ON p.applicant_id = ap.id
 WHERE ap.id = NEW.applicant_id AND NOT ap.is_test_row AND NOT p.is_test AND NOT p.archived
 AND p.apply_submitted_at IS NULL AND nullif(trim(ap.first_name),'') IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM public.hire_ready_invite_jobs j WHERE j.applicant_id = ap.id);
 IF FOUND AND a.first_texted_at IS NOT NULL
 AND (a.created_at AT TIME ZONE 'America/New_York')::date = (a.first_texted_at AT TIME ZONE 'America/New_York')::date THEN
   NEW.daily_new_app_reminder := true;
   NEW.nudge_at := public.new_application_reminder_at(a.first_texted_at);
   SELECT max(d.nudged_at) INTO NEW.nudged_at FROM public.hiring_deadlines d
   WHERE d.applicant_id = NEW.applicant_id AND d.kind = 'apply';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_new_application_morning_reminder() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER new_application_morning_reminder BEFORE INSERT ON public.hiring_deadlines
FOR EACH ROW EXECUTE FUNCTION public.set_new_application_morning_reminder();

DO $$
DECLARE definition text; old_clause text; new_clause text;
BEGIN
 definition := pg_get_functiondef('public.hiring_tick()'::regprocedure);
 old_clause := 'AND NOT p.archived AND NOT p.is_test' || chr(10) || '  LOOP' || chr(10) || '    UPDATE public.hiring_deadlines SET nudged_at = now() WHERE id = r.id;';
 new_clause := 'AND NOT p.archived AND NOT p.is_test
      AND (NOT d.daily_new_app_reminder OR (
        et_hour = 8
        AND (d.nudge_at AT TIME ZONE ''America/New_York'')::date = et_now::date
        AND p.apply_submitted_at IS NULL
        AND EXISTS (SELECT 1 FROM public.applicants ap WHERE ap.id = p.applicant_id AND NOT ap.is_test_row)
      ))
    ORDER BY d.nudge_at, d.id
    LIMIT 100
    FOR UPDATE OF d SKIP LOCKED
  LOOP
    UPDATE public.hiring_deadlines SET nudged_at = now() WHERE id = r.id;';
 IF position(old_clause IN definition) = 0 THEN RAISE EXCEPTION 'Existing hiring reminder hook not found'; END IF;
 definition := replace(definition, old_clause, new_clause);
 EXECUTE definition;
END $$;
COMMENT ON COLUMN public.hiring_deadlines.daily_new_app_reminder IS 'New same-day invited applicants: one next-morning reminder through the existing hiring tick, never a competing sender.';