# Migrations — which directory is authoritative

**`drizzle/migrations` is authoritative.** All schema, function, grant and RLS
changes go there, applied by the Lovable Cloud migration tool and tracked in
`drizzle.__drizzle_migrations`.

`supabase/migrations` is a **frozen historical set** from before the switch. It
is tracked in a *separate* ledger (`supabase_migrations.schema_migrations`), and
neither ledger orders the other — so any statement left in the legacy set that
contradicts a drizzle migration can silently revert it on a replay, a database
reset or in a fresh environment.

Rules:

1. Never add a new file to `supabase/migrations`.
2. If a legacy file contradicts a drizzle migration, neutralize the conflicting
   statement in the legacy file (comment it out with a dated note) rather than
   patching the live database again.

Conflicts already reconciled (2026-09-09):

| Legacy file | Conflict | Resolution |
| --- | --- | --- |
| `20260901231410_…` | `get_pro_capacity_stats` with no authorization, re-granted to `authenticated`; `get_customer_preferred_pro_options` pointed at the retired `pro_visits` | Both definitions removed; drizzle `0035` / `0056` are authoritative |
| `20260825144452_…` | `REVOKE ALL ON FUNCTION public.has_role(...) FROM authenticated` | Commented out; drizzle `0060` grants `has_role` to `authenticated` (RLS policies and admin RPCs depend on it) |
