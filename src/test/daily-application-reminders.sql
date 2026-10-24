-- Fail with division by zero if the production morning-selection rule changes.
SELECT 1 / CASE WHEN public.new_application_reminder_at('2026-10-24T03:59:59Z') = '2026-10-24T12:00:00Z'::timestamptz THEN 1 ELSE 0 END AS previous_eastern_day;
SELECT 1 / CASE WHEN public.new_application_reminder_at('2026-10-24T04:00:00Z') = '2026-10-25T12:00:00Z'::timestamptz THEN 1 ELSE 0 END AS new_eastern_day;
SELECT 1 / CASE WHEN public.new_application_reminder_at('2026-10-23T15:53:00Z') = '2026-10-24T12:00:00Z'::timestamptz THEN 1 ELSE 0 END AS eight_am_miami;
SELECT 1 / CASE WHEN public.new_application_reminder_at('2026-10-31T15:53:00Z') = '2026-11-01T13:00:00Z'::timestamptz THEN 1 ELSE 0 END AS dst_eight_am_miami;