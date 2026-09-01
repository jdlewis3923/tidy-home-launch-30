-- Free monthly add-on redemption tracking.
-- The bundle gift is ONE free premium add-on per month (no percentage discount).
alter table public.addon_attaches
  add column if not exists is_free boolean not null default false,
  add column if not exists free_period text;

create index if not exists addon_attaches_free_period_idx
  on public.addon_attaches (user_id, free_period)
  where is_free;