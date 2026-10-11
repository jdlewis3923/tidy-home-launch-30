# Roadmap

## Confirmed Car Care pay (Oct 11)
- [ ] Align scheduler and future Car Care jobs with wash 16/20/26 and full detail 78/88/115, flat across cadences.
- [ ] Audit and correct all Stripe contractor-pay metadata and customer-facing app, email and Indeed car-pay copy; list changes, verify, do not publish.

## QR page phone recoloring
- [x] Protect the founding page against browser automatic darkening; verified white quote surfaces and ZIP/service selection in light/dark modes with forced-dark Chromium enabled; no horizontal overflow. Not published; the specific phone browser remains unverified.

## Orientation language review (Oct 10)
- [ ] Review all English and Latin American Spanish slide copy, comparison directions and controls without changing business rules.
- [ ] Verify the signed-in preview and regenerated PDF for readable, correctly rendered bilingual text.

## Exact orientation reference corrections (Oct 10)
- [x] Add reference angular backgrounds, insurance card/document composition and two photo-led designs while retaining approved bilingual content; visual reproduction is not pixel-identical to the supplied montage.
- [x] Correct short or flattened photographs in viewer and PDF; verify 41 signed-in slides, download and inspect all 41 PDF pages.

## Phone screenshots and orientation reference (Oct 9)
- [x] Repair founding QR page phone readability, service cards and quote spacing in EN/ES.
- [x] Add reference-style role tiles, circular steps, service kits and photo-led endings; retain the existing bilingual content and gates rather than substitute reference slogans.
- [x] Verify phone/desktop rendering and regenerate the signed-in downloadable PDF; all 41 PDF pages inspected.

## Service landing pages (requested 2026-10-04)
- [x] Rebuild the three service heroes and the Refer/Bundle hero experiences to match the approved visual references without changing pricing or flows.
- [x] Category headlines with “&”, Shine Complete as car subtitle, and reservation buttons/date line across cleaning, lawn, and car pages.
- [x] Shared lighter service-photo scrim with measured readable headlines; solid navy bundle hero.
- [x] Set the canonical first-visit date to November 16 in both mirrors; check phone/desktop and parity tests.
- [x] Replace each service page with its matching worker photo in dedicated phone and desktop crops.
- [x] Place the two-home exterior on Refer and the house-with-car exterior on Bundle, using their dedicated phone and desktop crops.

## Homepage cadence pricing (requested 2026-10-04)
- [x] Show catalog monthly totals for all three cleaning and lawn cadences with visible visit counts; keep Shine Complete fixed.
- [x] Place the bilingual cadence answer first in FAQ and in the chatbot's winning knowledge entry.
- [x] Verify all three table states, quote/checkout parity and screenshots.

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

- [x] Light-mode-only email design with a relevant hero icon focal point in every email (36/36 live templates re-branded, 16/16 test emails sent)
- [x] Replace the favicon “T” with the official full TIDY wordmark and add fail-closed branding preflight to every hosted-template send

## Growth + quality pass (requested 2026-10-03)
- [ ] 48-hour guarantee copy: quote screen, checkout, hero trust line (+ remove Cancel Anytime chip), home section, welcome email, post-visit text/email; replace "First visit perfect" everywhere
- [ ] Redo system: member button (visit record + email), admin Redo task in Workday with 48h clock, free redo visit, Pro paid 50%, >2 redos/60d alert, redo-rate KPI
- [ ] Pro Partner = 50 visits · 4.8 avg · 60 days (replaces $1M insurance rule); progress strip; auto-apply + notify; weekly pay summary count
- [ ] Same-day praise forward to Pro by text (5★ or positive comment), logged; negative → admin only
- [ ] Review ask after visit 2 (+ once after visit 5); referral ask evening after visit 3; never same week
- [ ] Test member redo flow, screenshots (quote, checkout, hero), test Pro past 50 visits
- Texts queue until Twilio billing is fixed (user choice)

## Door-hanger claims audit (requested 2026-10-03)
- [ ] Change Terms service-issue notice from 24 to 48 hours and log it as wording already changed for legal review
- [ ] Verify completion requires before/after photos and expose the real photos on each member visit record
- [ ] Verify initial multi-service checkout and add-service billing produce one subscription, one monthly charge and one invoice; repair any split path
- [ ] Replace every cross-service “one Pro” claim in site, account, email sources and chatbot knowledge with service-specific consistency wording
- [ ] Add regression coverage and verify the member photo record and billing invariants

## /founding door-hanger page (requested 2026-10-05)
- [x] Keep the language toggle white in every state and verify complete Spanish text across the founding page and quote steps; retain real Google reviews verbatim.
- [x] Apply the 10-item founding conversion pass and replace the hero with the supplied mobile/desktop curtain-and-birds video pair
- [x] /founding page: price-first quote, live counter, reservation, confirmation, EN/ES, SEO/OG
- [x] Per-page on/off switches with dead-link and /founding-off guards
- [x] Scan/step/tap-to-call logging; Command reservations panel first
- [x] Write-first reservations, honeypot, duplicate update, founding flag past 25 (no waitlist)
- [x] Prices read from Stripe by lookup_key with cached fallback
- [x] Correct supplied How It Works screens, persist the selected-ZIP live counter, remove mobile clipping, and add restrained page motion
- [ ] Switch on the five extra add-on prices in Stripe (needs your go-ahead: changes live Stripe)

## Pro orientation (Oct 9)
- [x] Final spacing pass: separate Spanish subtitles and paragraphs; browser checked all 41 slides without clipping, visually reviewed all PDF pages and regenerated v6.
- [x] Replace slide four’s circles with larger raster artwork; delay entrances until photos load and add one visible ongoing slide accent.
- [x] Replace low-resolution crops with reconstructed 3840px masters; verify 49 unique deck photographs and high-resolution hub imagery.
- [x] Ensure every slide visibly animates when entered or scrolled into view, with replay and reduced-motion support; browser verified 41/41.
- [x] Add bilingual accepted-result and rework directions to all 15 comparisons; regenerate and inspect the 41-page v4 PDF.
- [x] Align the entire deck to supplied reference cadence, include all 44 contact-sheet images once and photographic welcome, preserve designed badge.
- [x] Build visibly distinct tile, timeline, quote, scenario and comparison compositions with staged motion; verify signed-in viewer, PDF download and all 41 rendered pages.
- [x] Rotate bright semantic slide palettes and layouts; keep the current font and signed-in gates.
- [x] Add orientation-only motion, swipe/click navigation and comparison controls with reduced-motion support.
- [x] Add diverse casting and a complete branded kit visual; regenerate and visually review every PDF page.
- [x] Add signed-in browser deck preview, PDF open/download, and prominent admin/Pro links.
- [x] Restyle orientation with heavier Tidy typography and image-led layouts; verify access, gating and progress.
- [x] /pro/orientation hub + 4 sections, stage-gated, bilingual, "I've read this" progress
- [x] 36 orientation images in public/orientation/
- [x] Admin: orientation progress on pipeline record; deck download on /admin/orientations + record
- [x] 12-point verification

## Lawn follow-ups (Oct 9)
- [x] Remove old $30 lawn surcharge everywhere
- [x] Flat Pro pay across cadences (lawn 18/26/40, cleaning 56/76/112) in code, DB and Stripe metadata
- [x] Adding lawn from an account waits for aerial verification (no visits until verified)
- [x] Stripe price swap for paid members after a size correction (confirm on increase)

## Scheduling system v3 (Oct 10)
- [x] Service days (admin grid + seed), Pro claims (5 states, catch-up day, 14-day drop rule), customer day picker, capacity, call-offs/holidays/weather moves, day loss, pivot ladder, waitlist, notifications, 20-point verification
