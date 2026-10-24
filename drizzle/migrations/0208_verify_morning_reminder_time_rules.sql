GRANT EXECUTE ON FUNCTION public.new_application_reminder_at(timestamptz) TO authenticated;
DO $$ BEGIN
 IF public.new_application_reminder_at('2026-10-24T03:59:59Z') <> '2026-10-24T12:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Previous Eastern day failed'; END IF;
 IF public.new_application_reminder_at('2026-10-24T04:00:00Z') <> '2026-10-25T12:00:00Z'::timestamptz THEN RAISE EXCEPTION 'Eastern midnight boundary failed'; END IF;
 IF public.new_application_reminder_at('2026-10-23T15:53:00Z') <> '2026-10-24T12:00:00Z'::timestamptz THEN RAISE EXCEPTION '8 AM Miami failed'; END IF;
 IF public.new_application_reminder_at('2026-10-31T15:53:00Z') <> '2026-11-01T13:00:00Z'::timestamptz THEN RAISE EXCEPTION 'DST 8 AM Miami failed'; END IF;
END $$;