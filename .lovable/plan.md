This is a large, multi-system change spanning schema, three external integrations (Jobber, Google Business Profile, Google Sheets), edge functions, cron jobs, admin UI, and the Pro dashboard with a full animation system. Before writing any code I need to confirm a few things and split the work into shippable phases — trying to do all 11 parts (A–K) in one shot will produce something that compiles but isn't actually wired to live data.

## What I'll need from you before I can finish parts B, C, H

These three integrations require credentials/setup that only you can do. I can scaffold the code, but it won't function until these exist:

1. **Jobber webhooks** — `JOBBER_WEBHOOK_SECRET` is not in the project secrets list. I see `JOBBER_CLIENT_ID`, `JOBBER_CLIENT_SECRET`, `JOBBER_REFRESH_TOKEN` already, but no signing secret. Also: Jobber doesn't natively emit `cancellation_initiated_by` — we'll need to infer "contractor-initiated <24h cancel" from the visit's `assignedUsers` and the audit log. I need to confirm the exact payload shape (there's already a `jobber-webhook` function in this project — is that the one to extend, or do you want a new one?).
2. **Google Business Profile API** — needs `GOOGLE_GBP_SERVICE_ACCOUNT_JSON`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`. None are set. GBP also requires the service account to be added as a Location Manager in the GBP dashboard.
3. **Master Google Sheet** — needs `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` and `MASTER_SHEET_ID`. Neither is set. The service account email also needs Editor access on the sheet.
4. **`canvas-confetti`** package — not currently installed; I'll add it.
5. **Review-bonus payout** — you reference "the existing review-bonus edge function." I don't see one in the project. Do you want me to create it, or is it under a different name?

## Proposed phased delivery

**Phase 1 — Ship now (no external creds needed):**
- Part A: Schema migration (all columns + helper tables `visits`, `google_reviews`, `complaints`, `escalations`, `jobber_webhook_log`) with RLS so a Pro can only `SELECT` their own `applicants` row.
- Part D: photo_compliance_rate generated column (free, in the migration).
- Part G: Rewrite `MyTierWidget` to read live from `applicants` for the logged-in user, remove all hardcoded sample numbers, render "0 / required" gray badges when null/0, full Tidy design system.
- Part J: Apply locked design system to the widget + new admin sections — navy/yellow, Inter/JetBrains Mono, criterion badges, Tier badges, **all 8 animations** (progress fill, criterion stagger, number counter via existing `AnimatedNumber`, tier-promotion confetti once per advancement, hover states, skeletons, realtime toast slide-in, tier-badge 360° flip), all respecting `prefers-reduced-motion`.
- Part E: "Log Complaint" modal in `/admin/applicants` drawer → inserts into `complaints`, increments `complaint_count`.
- Part F: "Open Escalation" button → inserts into `escalations`, increments `open_escalations_count`. Resolve action decrements.
- Part I: "Live Data Status" drawer section + "Recalculate Readiness" button.
- Seed row for `jdlewis3923@gmail.com` (visits=42, rating=4.9, cancels=1, photos 240/246, escalations=0).

**Phase 2 — After you provide creds:**
- Part B: Extend the existing `jobber-webhook` function (or create new) with HMAC verification using `JOBBER_WEBHOOK_SECRET`, handlers for `visit.completed`, `visit.cancelled`, `visit.rescheduled`, with photos_expected by service_type (cleaning=6, lawn=4, detail=8). Logs every payload to `jobber_webhook_log`.
- Part C: New `google-reviews-poller` edge function + `pg_cron` schedule every 60 min. Name-match logic, rating recompute, $25 review-bonus trigger when 5★ + matched.
- Part H: `master-sheet-sync` edge function (insert/update trigger via `pg_net` or DB webhook → edge function), backfill script, magic-link generation in `offer-contract` flow.

## Technical notes (for your reference)

- The `applicants` table already has many of these columns from earlier migrations (`tier`, `completed_visits`, `avg_customer_rating`, `contractor_cancel_rate`, `complaint_rate`, `photo_compliance_rate`, `open_quality_escalations`, `tier_readiness_status`, `tier_advanced_at`, `pro_partner_interest`). I'll add only what's missing: `contractor_id`, `jobber_id`, `google_review_match_name`, `last_visit_at`, `total_ratings_count`, `contractor_cancel_count`, `complaint_count`, `photos_uploaded_count`, `photos_expected_count`, `open_escalations_count`, `dashboard_url` (generated), and **convert** existing `contractor_cancel_rate`/`complaint_rate`/`photo_compliance_rate` numeric columns to GENERATED — that requires DROP + ADD, which I'll do in the migration.
- Existing `open_quality_escalations` column will be aliased / kept in sync with new `open_escalations_count` (or we rename — your call). Default plan: rename to `open_escalations_count` and update existing references in `MyTierWidget`, `AdminApplicants`, the three tier edge functions.
- RLS on `applicants` currently only allows admin SELECT and public INSERT. I'll add a `pro select own` policy: `auth.uid() = contractor_id`.
- Realtime: enable `applicants` on the `supabase_realtime` publication so the widget can subscribe.
- `canvas-confetti` (~7kb) for the celebration burst.

## Questions before I start

1. **Confirm Phase 1 scope is what you want shipped first**, with Phase 2 (the three live integrations) following once you provide the 5 secrets/answers above? Or do you want me to scaffold Phase 2 code now (non-functional until secrets land) so the wiring is in place?
2. For the existing `jobber-webhook` function — extend it or create a parallel one?
3. Is there an existing `review-bonus` edge function I'm missing, or should I create it (Stripe Connect transfer of $2500 cents to the Pro's connected account)?
4. Confirm renaming `open_quality_escalations` → `open_escalations_count` is OK (one column, no data loss).