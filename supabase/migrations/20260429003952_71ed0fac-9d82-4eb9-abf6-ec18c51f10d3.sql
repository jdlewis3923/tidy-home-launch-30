create or replace function public.is_site_live()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value)::boolean from public.app_settings where key = 'site_live'), true);
$$;

grant execute on function public.is_site_live() to anon, authenticated;

create or replace function public.admin_set_site_live(_live boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'forbidden';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('site_live', to_jsonb(_live), now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  return _live;
end;
$$;

insert into public.app_settings (key, value)
values ('site_live', to_jsonb(true))
on conflict (key) do nothing;