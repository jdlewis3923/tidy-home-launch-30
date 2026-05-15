# Pro Dashboard live data + COI + sheet sync

This is a large multi-system build that depends on credentials I don't have yet. I'll ship it in 3 phases so the UI side is usable immediately while the integrations come online as their secrets are provided.

## Phase 1 — Schema + UI wiring (ship now, no external creds needed)

**Database migration** (single migration):
- Add to `applicants`: `coi_uploaded_at`, `coi_pdf_url`, `coi_effective_date`, `coi_expires_at`, `coi_carrier_name`, `coi_policy_number`, `coi_review_status`, `coi_review_notes` (skip generated `dashboard_url` — derive client-side; Postgres generated columns can't reference `gen_random_uuid()`-derived columns reliably, and we'd risk breaking existing rows).
- Convert `contractor_cancel_rate`, `complaint_rate`, `photo_compliance_rate` to **regular columns updated by trigger** (not GENERATED — Postgres generated columns can't reference other generated values cleanly; trigger keeps the same UX with more flexibility).
- New tables: `visits`, `google_reviews`, `complaints`, `escalations`, `today_visits`, `stripe_payouts`, `referrals`, `jobber_webhook_log`, `tier_audit_log`.
- Storage bucket `contractor-coi-pdfs` (private, 10MB, PDF-only) with RLS: Pro can upload to `/{contractor_id}/...`, admin can read all.
- RLS on every new table: Pro reads own row by `contractor_id = auth.uid()`; admin reads all.
- Seed Justin's row + 42 fake visits + 38 fake ratings + 3 today_visits + 1 stripe_payouts ($640).

**Frontend**:
- Apply Part J design tokens to `index.css` (Inter + JetBrains Mono, exact hex tokens, criterion badge variants, tier badges, navy hero band w/ 3px yellow stripe).
- Rewrite `MyTierWidget` to read from `applicants` for `auth.uid()`, remove all hardcoded fallbacks (show "0 / required" gray when null/0).
- Rewrite the 8 dashboard widgets to read from the new tables. Skeletons while loading.
- Animations: progress bar fill (1200ms ease-out), criterion stagger fade-in (80ms), AnimatedNumber for stats, shimmer pulse, hover lifts, prefers-reduced-motion guard.
- Realtime: subscribe to `applicants`/`today_visits`/`stripe_payouts`/`google_reviews` UPDATE channels for the current user; toast on +1 visit / +5★ review.
- Confetti celebration (`canvas-confetti`) when readiness flips to ready, persisted via `localStorage` key per advancement.
- Fix referral copy from `$150` → `$200` everywhere (`MyTierWidget`, `ProDashboard` ref card, `ProTierProgression`).
- New page `/pro/upload-coi` (JWT-gated, 3-step indicator, drop zone, PDF.js preview, carrier/policy/dates form, submits to storage + edge fn).
- New page `/admin/coi-review` (queue of `pending_admin_review`, inline PDF viewer, Approve/Reject).

## Phase 2 — Edge functions (ship now, gated on secrets per integration)

| Function | Purpose | Secret needed |
|---|---|---|
| `jobber-webhook` | HMAC verify, ingest visit events, update counts | `JOBBER_WEBHOOK_SECRET` |
| `jobber-schedule-sync` (CRON 15min) | Pull next-24h visits → `today_visits` | already have `JOBBER_*` |
| `google-reviews-poller` (CRON 60min) | Poll GBP, dedupe, name-match, $25 bonus | `GOOGLE_GBP_SERVICE_ACCOUNT_JSON`, `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID` |
| `stripe-payout-sync` | Webhook for `transfer.created`/`transfer.paid` | already have `STRIPE_*` |
| `upload-coi-submitted` | Email Justin + flip status | already have `BREVO_API_KEY` |
| `coi-expiry-check` (CRON daily 9am ET) | 30/14/0/+7 day reminders | needs Brevo template IDs |
| `referral-bonus-check` (CRON daily 6am ET) | Pay $200 after 10 visits | already have Stripe |
| `master-sheet-sync` | Upsert applicants/visits/audit log to sheet | `MASTER_SHEET_ID`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON` |
| `tier-readiness-snapshot` (CRON daily 6am ET) | Refresh snapshot tab | same as above |
| `recalculate-readiness` | Manual admin button | none |

I'll scaffold every function. Ones whose secrets exist will be live; others return 503 until the secret arrives, and I'll prompt for them in batches.

## Phase 3 — Admin polish

- `/admin/applicants` drawer: "Live Data Status" panel (last webhook, last review match, totals with drilldown links), "Recalculate Readiness" button, "Log Complaint" + "Open Escalation" modals.
- Tier badge column in the table.

## What I need from you to ship Phase 2 in the same session

These secrets — drop them and I'll wire each function the moment they're set:

1. **`JOBBER_WEBHOOK_SECRET`** (Jobber → Settings → Integrations → Webhooks → reveal signing secret)
2. **`GOOGLE_GBP_SERVICE_ACCOUNT_JSON`** + **`GBP_ACCOUNT_ID`** + **`GBP_LOCATION_ID`** (Google Cloud → service account JSON, GBP account/location IDs from your business profile)
3. **`MASTER_SHEET_ID`** = `13WGFqOTt_ccRwVVR_FU2VKKE1N91HASZHdhHpMjgunc` (I'll set this)
4. **`GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON`** (same service account is fine — share the sheet with that service account email as Editor)
5. **Brevo template IDs** for `COI-RENEWAL-30`, `COI-RENEWAL-14`, `COI-REJECTED` (I can scaffold the function with placeholder IDs and you swap in real numbers later)

## Decisions I'd like you to confirm before I start

1. **Generated columns**: I want to use a **trigger** to maintain `*_rate` columns instead of Postgres `GENERATED` columns — same outcome from your perspective, but lets webhooks update one number atomically and avoids nasty migration failures with existing rows. OK?
2. **`dashboard_url`**: derive client-side as a constant `https://jointidy.co/pro` (Pros only see their own data via RLS — no `?as=` needed, that's actually a security smell). The `dashboard_url` written to the sheet is just the static URL. OK?
3. **Phase 2 strategy**: ship all edge function code now, gate each behind a secret check (returns 503 with a helpful message if its secret is missing) so you can light them up one by one without me touching code again. OR wait until you have all secrets ready and ship them in one pass. Which do you prefer?
4. **COI test JWT**: I'll generate a test JWT for `jdlewis3923@gmail.com` and link it in the screenshot. OK?

Reply with answers (or just "go ahead, your call on all four") and I'll start Phase 1 immediately.