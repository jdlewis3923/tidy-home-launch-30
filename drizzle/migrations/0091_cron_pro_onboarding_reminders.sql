-- Tidy — daily Pro onboarding reminder.
-- 9:15 AM America/New_York during EDT (13:15 UTC). One email per Pro listing
-- only what is still missing; after two reminders the job raises an admin alert
-- instead of emailing again.
SELECT cron.schedule(
  'pro-onboarding-reminders-daily',
  '15 13 * * *',
  $job$SELECT public.cron_http_post('pro-onboarding-reminders-daily', 'pro-onboarding-reminders', '{}'::jsonb);$job$
);