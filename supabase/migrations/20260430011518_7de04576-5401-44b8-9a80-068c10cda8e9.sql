create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  zip text not null,
  source text not null default 'signup_zip_gate',
  requested_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "waitlist insert anyone" on public.waitlist;
create policy "waitlist insert anyone"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "waitlist admin select" on public.waitlist;
create policy "waitlist admin select"
  on public.waitlist
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create index if not exists waitlist_zip_idx on public.waitlist(zip);
create index if not exists waitlist_requested_at_idx on public.waitlist(requested_at desc);