-- Jobber decommission (app scope only).
--
-- Dispatch is the Tidy Pro Portal: it generates visits, assigns pros, carries
-- the job card and pays people. Jobber contributed only error noise — the
-- 15-minute schedule sync returned 502 (malformed GraphQL) and the job create
-- mutation never succeeded once.
--
-- This migration only stops the timer that calls Jobber. Every jobber_* id
-- column is intentionally LEFT IN PLACE as dead data: dropping columns is
-- irreversible and buys nothing today. Zapier is untouched.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'jobber-schedule-sync-15m') then
    perform cron.unschedule('jobber-schedule-sync-15m');
  end if;
end $$;