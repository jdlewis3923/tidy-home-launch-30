-- Public, read-only proof feed for the /neighbor landing page.
-- Exposes ONLY an aggregate count plus one anonymised quote; never raw rows.
create or replace function public.public_five_star_proof()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select comment, reviewer_name, posted_at
    from public.reviews
    where stars = 5
      and coalesce(status, '') <> 'rejected'
  )
  select jsonb_build_object(
    'count', (select count(*) from eligible),
    'quote', (
      select jsonb_build_object(
        'comment', left(comment, 140),
        'name', split_part(coalesce(reviewer_name, ''), ' ', 1)
      )
      from eligible
      where comment is not null and length(trim(comment)) > 0
      order by posted_at desc
      limit 1
    )
  )
$$;

revoke all on function public.public_five_star_proof() from public;
grant execute on function public.public_five_star_proof() to anon, authenticated;
