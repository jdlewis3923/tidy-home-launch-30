
create table if not exists public.kpi_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  kpi_code text not null,
  step_index int not null,
  label text not null,
  why_text text not null default '',
  how_steps jsonb not null default '[]'::jsonb,
  action_type text not null default 'MANUAL',
  action_key text,
  action_payload jsonb not null default '{}'::jsonb,
  predicted_impact_text text,
  predicted_impact_cents int,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kpi_code, step_index)
);

alter table public.kpi_playbook_steps enable row level security;

create policy "playbook_steps admin read" on public.kpi_playbook_steps
  for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "playbook_steps admin write" on public.kpi_playbook_steps
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create index if not exists idx_playbook_steps_kpi on public.kpi_playbook_steps(kpi_code, step_index);

create table if not exists public.kpi_step_completions (
  id uuid primary key default gen_random_uuid(),
  kpi_code text not null,
  step_index int not null,
  user_id uuid not null,
  notes text,
  completed_at timestamptz not null default now()
);

alter table public.kpi_step_completions enable row level security;

create policy "step_completions admin read" on public.kpi_step_completions
  for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "step_completions admin insert" on public.kpi_step_completions
  for insert to authenticated
  with check (auth.uid() = user_id and public.has_role(auth.uid(), 'admin'::app_role));
create policy "step_completions admin delete" on public.kpi_step_completions
  for delete to authenticated using (auth.uid() = user_id and public.has_role(auth.uid(), 'admin'::app_role));

create index if not exists idx_step_completions_kpi on public.kpi_step_completions(kpi_code, step_index);

-- Vault helper for storing VAPID secrets via service role / admin only
create or replace function public.admin_set_vapid_secret(_name text, _value text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_id uuid;
  v_allowed text[] := array['PWA_VAPID_PUBLIC_KEY','PWA_VAPID_PRIVATE_KEY','PWA_VAPID_SUBJECT'];
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  if not (_name = any(v_allowed)) then
    raise exception 'invalid secret name: %', _name;
  end if;
  select id into v_id from vault.secrets where name = _name limit 1;
  if v_id is null then
    perform vault.create_secret(_value, _name, 'auto-generated VAPID');
  else
    perform vault.update_secret(v_id, _value, _name, 'auto-generated VAPID');
  end if;
end;
$$;

create or replace function public.admin_get_vapid_public()
returns text
language plpgsql
security definer
stable
set search_path = public, vault
as $$
declare v_value text;
begin
  -- Public key is safe to read for any authenticated admin (UI needs it for subscribe)
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  select decrypted_secret into v_value from vault.decrypted_secrets where name = 'PWA_VAPID_PUBLIC_KEY' limit 1;
  return v_value;
end;
$$;
