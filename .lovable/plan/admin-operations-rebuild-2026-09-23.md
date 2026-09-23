# Admin operations rebuild

## Outcome
Repair applicant email delivery first, add a live Workday feed to Command, fix the shared admin shell, then move every admin screen onto one Tidy console system without touching pricing, Stripe, subscriptions, or customer-facing copy.

## 1. Repair operational delivery first
- Replace the split direct-versus-connected Brevo paths with one shared sender using the already-working Brevo connection, one verified sender identity, bounded retry for transient failures, and one email-log writer.
- Route every Brevo call site through that sender, preserving template name, recipient, status, provider message ID, and useful error text. Replace every operational `admin@jointidy.co` recipient with `hello@jointidy.co`.
- Keep marketing suppression behavior where it already applies, while relationship and admin messages remain transactional.
- Disable the applicant-to-Master-Sheet write path by configuration/code so the disabled Google Sheets API no longer creates repeated alerts; record one quiet integration status instead. Do not touch Zapier.
- Repair the insurance-expiry heartbeat mismatch. The database scheduler is firing daily, but the function has recorded no receiving-side acknowledgement; update/deploy the function and cron health evidence, invoke it safely, then resolve only the stale alert after a successful acknowledgement.
- Submit one clearly marked test application through the real form, verify both applicant and admin emails are recorded as sent, capture it for Workday verification, then delete the test applicant and related test-only records.

## 2. Build Workday above Command’s financial rollup
- Add an admin-only activity ledger and secure read/retry actions. Normalize these events: application submitted, email result, stage change, Checkr status, insurance status, intake submission, Call Queue text prepared, and call booked.
- Populate events from the existing applicant, onboarding, insurance, Checkr, email-log, and Call Queue paths. New applications write immediately with every submitted answer, score, tier, and a direct applicant link.
- Add the required action alert and detailed admin email for every new application; include it in both existing hiring digests.
- Add Today / Yesterday / Last 7 days controls, newest-first rows, direct action buttons, failure details and real retry behavior.
- Add today’s count strip for applications, sent emails, failed emails, booked calls, and waiting-on-me; clicking waiting-on-me filters the feed.
- Keep the Twilio warning visible, link it to the Twilio console, and use the exact account-level billing message requested without letting it affect unrelated jobs.

## 3. Replace the admin rail with a real shell
- Turn the current overlay into a two-column admin layout: fixed, internally scrollable rail; fixed top status/capacity area; content offset by the rail width and starting at the top of the viewport.
- Add a phone hamburger/drawer and full-width content on small screens.
- Group the unchanged pages/routes into Today, Hiring, Compliance, Customers, Money, and System exactly as specified.
- Expand Today on first use and always expand the current page’s group; persist the other group choices per admin. Group headers show summed child badges.
- Preserve global search and `/` focus, and reset document scroll after navigation.

## 4. Apply one Tidy admin design system
- Define the supplied navy, deep blue, blue, yellow, ink, muted, hairline, wash, and status colors once as semantic light/dark admin tokens.
- Add shared admin page, page-header, card, table, status, and empty-state patterns; use the stable raw GitHub Tidy logo.
- Convert every routed admin page to the shared shell/header and remove page-owned canvas/header colors, width offsets, and conflicting light-only surfaces.
- Standardize buttons through the existing button component, tables, labels, typography, charts, status colors, cards, and empty states. Preserve the terminal clock, chips, and monospace touches.
- Keep dark as the default and verify the existing light/dark control has readable contrast in both modes.

## 5. Verification and cleanup
- Verify the application submission and both email results in the live backend and Workday, then remove the test data.
- Verify the Sheets write no longer retries or raises repeated alerts and the insurance job has a successful receiving-side acknowledgement.
- Browser-check `/admin/kpis`, `/admin/applicants`, `/admin/command`, `/admin/documents`, and `/admin/alerts`; report each measured `MAIN` top position and keep it near the requested 200px ceiling.
- Capture Workday with the test application, the grouped rail with Hiring expanded, and Applicants in light and dark modes.
- Run focused email/activity/admin tests plus the existing relevant suite, and confirm the preview build remains healthy.

## Technical notes
- Schema changes will be additive, admin-only, explicitly granted, and protected by row-level policies.
- Email retries will retry only transient network/5xx/429 responses, never authentication failures or duplicate successful sends.
- No secrets will be printed or committed. The current Brevo secret exists and the working code path proves it is usable through the shared connection; the secure update form is only needed if that consolidated path still fails credential verification.
