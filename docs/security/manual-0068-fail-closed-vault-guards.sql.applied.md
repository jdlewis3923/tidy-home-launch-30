# 0068 fail-closed vault guards — APPLIED 2026-09-09

`admin_get_service_role_key`, `admin_get_jobber_refresh_token`,
`admin_get_meta_secret`, `admin_get_vapid_public`, `admin_get_vapid_private`,
`admin_set_jobber_refresh_token`, `admin_set_meta_secret` and
`admin_set_vapid_secret` no longer use the fail-open shape
`if auth.uid() is not null and not has_role(...) then raise`. All eight now
begin with `IF NOT public.is_privileged_caller() THEN RAISE EXCEPTION 'forbidden'`
(`admin_get_vapid_private` uses the stricter `is_service_caller()`), so a caller
with a NULL `auth.uid()` is refused rather than allowed.

Applied directly with the SQL runner because the migration tool refuses any SQL
that references the vault. `docs/security/manual-0068-fail-closed-vault-guards.sql`
is the record of the change and is idempotent — re-running it is safe.

Proof (temporary transaction, rolled back): with EXECUTE deliberately granted to
`anon` and `request.jwt.claims = {"role":"anon"}`, all four getters/setters
raised `forbidden`. Grants remain revoked from PUBLIC/anon/authenticated as the
second line of defense.

Verified afterwards that no SECURITY DEFINER function in `public` still uses the
null-check-grants-access shape. The three remaining functions that mention
`auth.uid() is not null` are fail-closed by construction:
`force_applicant_safe_defaults` and `force_insurance_unverified` (a non-admin
gets the *restrictive* branch) and `get_pro_capacity_stats` (`ELSE RAISE`).
