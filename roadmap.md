# Roadmap

## Pro onboarding (one email, three links)
- [x] 30-day tokens for insurance + intake links, admin regeneration, intake expiry guard
- [x] /coi token upload endpoint writing to /admin/insurance + /admin/coi
- [ ] /coi/:token page (bilingual, requirement + $50/mo reimbursement copy)
- [ ] Welcome email (Brevo template 64) rewritten, sent on stage → offer
- [ ] Daily 9:15 AM ET reminder (day 2, day 5, then admin alert)
- [ ] Admin status chips + resend / copy link
- [ ] End-to-end test with a throwaway Pro, then delete it

## Blocked on Justin
- [ ] Checkr API key / package slug / webhook secret — approval still pending on Checkr's side.
      Until then the welcome email says the background check is coming and Justin sends the
      Checkr invitation manually; no dead button is shown.

## Pro onboarding — status 2026-09-22
- Done: token pages (/coi/:token, /intake/:token), onboarding email (Brevo 64), reminders job scheduled 9:15 AM ET, admin status chips with resend/copy-link/new-links, end-to-end test passed and test record deleted.
- Blocked: Checkr secrets (API key, package slug, webhook secret) — background check invite is sent manually until then.
- Open question: street address for the CAN-SPAM footer.

## Admin operations rebuild — requested 2026-09-22
- [x] Repair the Brevo credential path and link the verified Brevo connection
- [x] Consolidate transactional Brevo sends, replace admin recipient with hello@jointidy.co, preserve detailed send logs, and verify a two-email application send
- [x] Stop repeated Google Sheets 403 alerts by disabling the master sync with a quiet logged skip; Zapier remains untouched
- [x] Repair and verify the daily insurance expiry job
- [x] Add Workday activity feed, counters, filters, direct actions, and new-applicant alert/digest coverage
- [x] Replace the flat admin rail with six persisted groups and a mobile drawer
- [x] Fix the admin shell so content starts at the viewport top beside a fixed rail
- [x] Apply one tokenized Tidy design language across the five priority admin pages in light and dark modes
- [x] Run browser acceptance checks, capture requested screenshots and measurements, then delete test records

## Pro kit standard (new, 2026-09)
- Cleaning: 2 embroidered polos + photo ID badge (no vest). Lawn: 2 tees + 2 hi-vis vests + badge. Car care: 2 tees + badge.
- Magnets optional on all three services, $15/month advertising credit with the Friday deposit, signed vehicle advertising agreement first, household magnet test before ordering.
- Intake submission now auto-builds the vendor order, emails the owner and the Pro (badge photo link). No manual send step.
- Open: legal review of the vehicle advertising agreement + ICA before the 10th signed Pro (tracked in /admin/documents).

## Email design standardization (requested 2026-09-23)
- [x] Inventory every customer, Pro, applicant, owner/admin, alert, digest, and account email
- [x] Create one reusable Tidy email shell matching the customer design language
- [x] Move every inline email onto the shared shell without changing its business copy or trigger
- [x] Read and update every registered live Brevo template, preserving IDs and merge fields
- [ ] Brand account/auth emails with the same logo, banner, typography, and footer — blocked until a sending domain is configured
- [x] Add regression coverage so new unbranded email HTML cannot be introduced
- [x] Send representative tests and verify rendering on desktop and mobile — 16/16 generated tests delivered; all 36 live templates pass the markup audit
