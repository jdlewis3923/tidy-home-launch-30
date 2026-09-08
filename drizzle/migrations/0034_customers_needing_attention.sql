-- Customers that need manual review: on a retired SKU price or with no Pro assigned.
create or replace function public.customers_needing_attention()
returns table (
  subscription_id uuid,
  user_id uuid,
  first_name text,
  last_name text,
  monthly_total_cents integer,
  preferred_pro_id uuid,
  retired_price boolean,
  missing_pro boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id as subscription_id,
    s.user_id,
    p.first_name,
    p.last_name,
    s.monthly_total_cents,
    s.preferred_pro_id,
    not exists (
      select 1 from public.stripe_catalog sc
      where sc.active = true
        and sc.price_cents = s.monthly_total_cents
    ) as retired_price,
    (s.preferred_pro_id is null) as missing_pro
  from public.subscriptions s
  left join public.profiles p on p.user_id = s.user_id
  where s.status = 'active'
    and (
      s.preferred_pro_id is null
      or not exists (
        select 1 from public.stripe_catalog sc
        where sc.active = true
          and sc.price_cents = s.monthly_total_cents
      )
    )
  order by s.monthly_total_cents desc, p.last_name, p.first_name;
$$;

grant execute on function public.customers_needing_attention() to authenticated;
grant execute on function public.customers_needing_attention() to service_role;
