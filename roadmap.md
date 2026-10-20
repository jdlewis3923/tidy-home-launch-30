# Roadmap

## Growth roadmap (Oct 20)
- [x] /admin/roadmap: 6 initiatives, switches (all OFF), gates, checklists, build prompts, 24-month timeline; Launch now / Pause.
- [x] Hourly roadmap check: 8 AM launch-day switch, kickoff text, URGENT overdue alerts; 9 AM digest kickoff + "Coming up" + milestones. Test kickoff text and digest sent.
- [x] Visit-count answer recorded (biweekly 26 delivered / 24 billed; weekly 52 / 48).
- [x] Prepaid Year pricing + refund math rules (tested: $189 → $2,041.20; cancel at 3 → refund $1,474.20; 45-day notice).
- [ ] Prepaid Year build: annual Stripe prices (live+test), hidden Monthly/Yearly toggle, prepaid flag, 45-day renewal email, Terms/FAQ EN+ES, Stripe test purchase+cancel — next.
- [ ] Bundle Push build (hidden) — after Prepaid Year; seasonal drafts need approval.
- [ ] Pressure Washing build (hidden) — Stripe tiers + booking; drafts need approval.

## Owner Daily Signal and alert cleanup (Oct 20)
- [x] Rebuilt owner email as navy Daily Signal matching reference exactly (sharp photos, colored panels); test digest sent.
- [x] Separate owner Daily Signal layout with reference photos, white surfaces, live numbers and compact gold actions; desktop/phone rendering has no overflow or broken images.
- [x] Clear 46 verified recovered/test/duplicate alerts; resolved rows stay out of Alerts and deduplicated digests. Genuine failures retained; zero open watchdog/test-document alerts.
- [x] Deploy owner renderer and sender dependencies; 35 tests passed; authenticated live preview and one refreshed email accepted.
- [ ] Actual Outlook dark-mode appearance — Justin must check the freshly sent email; app chrome is outside sender control.

## Evening notifications repair (Oct 20)
- [x] Restore watchdog refresh, deduplicate failures, and clear recovered alerts without deleting history.
- [x] Include real completed applications in digests; exclude test notifications.
- [x] Verify live watchdog and digest preview; 15 regression tests passed. Remaining genuine failures retained.

## Social calendar + service booking (Oct 19) — do not publish
- [x] Deliver before-change publisher/history report and both full row inventories; external Zapier/Planner history unavailable.
- [x] Single app publishing path, image-byte hashes, per-platform immutable confirmations, strict slots and 90-day repeat blocks; confirmed history imported. Nextdoor/LinkedIn held without direct connections.
- [x] Exact 14-day preview with image replacement and rescheduling; browser dry-run published three isolated snapshots and blocked duplicate fourth. PNG Instagram cards remain visibly blocked until JPEG replacements.
- [x] All-service selection enabled; nine service/ZIP quotes and three admin-authorized test reservations verified through UI, test reservations deleted (0 remain).
- [ ] External social history and disable social Zaps / clear Meta Planner — requires Justin's connected accounts or exports.
- [ ] LINKEDIN_ZAP_WEBHOOK_URL secret not set — Justin must add it (red banner on /admin/social until then); LinkedIn posts block without it.
- [ ] Social post #2 (Oct 16, "What a founding home gets") is missed — Justin reschedules explicitly on /admin/social.

## Lifecycle event triggers + simulator (Oct 18) — shadow only, unpublished
- [x] Lead/reservation/invoice/visit/rating/move/add-on/referral table events and checkout expiry hooks; daily planner reuses the existing tick; all 50 rules remain shadow.
- [x] Admin-only simulator, isolated is_test clones, 24-step journey and message timeline; browser verified 61 messages, 0 simulated orphans, replay protection PASS.
- [x] All 50 registered events queued in database audit; 15 targeted tests passed; preview build OK.
- [ ] Live SMS delivery and inbound signature checks — blocked by inactive Twilio account; no messages sent during tests.
- [ ] Full end-to-end producer verification (real Stripe events, completed Pro visits, automatic referral credit) — provider/test-job flows not exercised; simulator checks dispatch, not external producers.
- [ ] Reconcile legacy senders and rare change-reason mappings before cutting over; existing Zaps/senders remain unchanged in shadow.

## Email phone appearance and intent artwork (Oct 18)
- [x] White raster-backed surfaces and website-gold buttons; no grey surfaces. Phone-sized dark browser and stripped-style preview verified.
- [x] Reviewed all 13 existing banners; corrected team/support/equipment/billing/review/lawn/account intent routing and upgraded all 36 registered hosted templates without changing copy or merge fields.
- [x] Sender/artwork tests passed; 53 affected senders deployed; live hosted audit repeated with zero changes/failures.
- [ ] Actual Outlook Android dark-mode confirmation — needs a fresh email screenshot from Justin; browser checks cannot guarantee all email apps.

## Hiring system v5 (Oct 17) — CORE BUILT, do not publish
Replaces v3/v4 hiring prompts and the 13 Oct stage order. Keeps: proof page, spend lock, override audit, probation, hiring documents panel.
- [x] Stages 0–10 server-enforced (0169); legacy mapped (screened→phone_screened, ins_quote→background/agreement); archived/is_test untouched
- [x] /apply rebuild: 12 sections, EN/ES, autosave + resume token, unset sliders, knockouts archive "knockout_apply", question_bank + application_answers
- [x] Fit Report /admin/hiring/fit/:id — gauges, F1–F10, split talking points, live (0173 fix)
- [x] Scorecards /admin/hiring/phone|ref|interview/:id with PASS rules (interview needs Intent ≥ 60)
- [x] Slots /admin/hiring/slots + candidate self-book /pro/book/:token; one reschedule per kind
- [x] candidate_faq seeded (pay-timing row flagged needs_justin)
- [x] 15-min hiring_tick scheduler (0171): nudges, auto-archive with reason, slot reminders, weekly check-ins + URGENT
- [x] Messages: nudge/book_phone/slot_reminder/weekly_checkin/close_out EN+ES in pipeline-notify
- [x] Dashboard /admin/hiring: seats, funnel, Intent-sorted table, ghost report
- [ ] YES-revival of archived candidates (inbound SMS handling) — not built
- [ ] Today list + banner on dashboard — partial
- [ ] Full 13 DONE-WHEN verification with is_test candidates — not run
- [ ] In-person location setting UI (app_settings.hiring_inperson_location) — DB ready, no UI

## Confirmed Car Care pay (Oct 11)
- [x] Aligned scheduler and future Car Care jobs with wash 16/20/26 and full detail 78/88/115; verified all 18 size/cadence/kind combinations. Only canceled Car Care jobs existed; historical pay retained.
- [x] Audited 125 live and 51 test Stripe prices: fixed four wash monthly totals per mode, removed ten unmappable archived pay fields live; repeat audits found no changes. Corrected Car Care rows in hosted templates 61/62 preserving Partner uplift; app/orientation/Indeed stored copy already correct. 56 tests passed; not published. External already-posted Indeed ads were not accessible.

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

- [x] Master prompt Part C — launch dates in launch_config, car care 30 Nov, server gates.
- [x] Part D screens: service scope admin, size review, evidence pack, Pro job card, terms
- [x] Part E — alert tiers, urgent on insert, 9 AM / 9 PM digests, /admin/alerts tiers
- [x] Part F — one post one row, duplicate + double-publish guards, archive, rebuild to 31 Dec, /admin/social
- [ ] Part G — launch scheduling (next).

## Launch date change (Oct 13)
- [x] Cleaning/lawn 23 Nov, conversion 16 Nov, ready-by 20 Nov, late week 30 Nov; car dates empty
- [x] Car care opens on demand: threshold alert, digest line, proposal + Approve, server gates, customer/Pro copy
- [x] Thanksgiving Thursday first visit line; waitlist hold counted from conversion
- [ ] Car line added to an existing bill when car opens is an admin step (alert lists it), not automatic

## Social calendar (Oct 13)
- [ ] Load 39 posts (34 FB+IG, 5 Nextdoor), images/cards, IG "Link in bio", checks S-1..S-7 — not started; re-plan around 23 Nov + no car date needed

## Hiring v5 — 4 gaps (DONE, unpublished)
- [x] Inbound SMS keyword handler (C/CONFIRM, R, 1, 2, YES, STOP/START, unread→digest, unknown→unmatched list)
- [x] SMS dry-run toggle + Outbox page + Simulate reply box
- [x] Today list on hiring dashboard
- [x] Meeting location editor + booking block when empty
- [x] Scheduler timing: 15-min 8AM–9PM ET, hourly overnight
- [x] 13 v5 checks run in dry-run — all pass
- [x] Twilio reactivated 19 Oct: dry-run OFF, readiness probe all-pass (10DLC VERIFIED), real test text accepted (SM3b8f0ecb…), 13 Indeed invites sent live
- [x] Invite page /admin/hiring/invite (hiring-invite fn): paste rows → create/resend/reopen-by-phone, tokenized /apply link, EN/ES, sprint-aware deadline
- [x] Sprint mode: hiring_sprint_set RPC + dashboard toggle; 48h→24h deadlines, 12h nudge, auto-off Thu 29 Oct 11:59 PM ET
- [x] Andrew booked Thu 22 Oct 12:00 PM ET phone (staff Justin), note "Call agreed by text. Application due before the call."
- [x] Slots: Sat 24 Oct phone+in-person and future Saturday in-person deleted; seed now phone Mon–Fri only + in-person Wed 28/Thu 29 Oct
- [x] Candidate texts de-Saturday'd (book_phone, ProBook, inCallWindow); FAQ uses live launch placeholders
- [ ] Rebecca was NOT already on file — created fresh (no resend needed); confirm her Indeed phone matches

## Lifecycle messaging (replaces Zapier) — in progress, shadow mode ON
- [x] Engine: contacts, lifecycle_sequences, lifecycle_templates, message_queue; quiet hours; stage-change stop rule; orphans RPC
- [x] lifecycle-tick sender (15-min cron): consent gates, 1 marketing/day cap, 3x retry, SMS→email fallback, shadow/live stages
- [x] lifecycle-event stage-transition endpoint; STOP/START/HELP on inbound texts
- [x] /admin/messages page: stages, copy EN/ES review, toggles, counts, orphans, test mode
- [x] Seeded: PRICE_SEEN, RES_STARTED, POPUP, RESERVED, CONVERTING, CHECKOUT_ABANDONED, OUT_OF_AREA, FOUNDING_FULL, CUSTOM_QUOTE
- [ ] Capture wiring: text-me-my-price, reservation field-save, popup stage, src tags, retargeting audience
- [ ] Section 3 stages: WELCOME, EVERY VISIT, CHANGES BY TIDY, PAYMENT FAILED, REVIEW, REFERRAL, CROSS-SELL, BUNDLE GIFT, MONTHLY EMAIL, CARD EXPIRING, PAUSE, CANCEL REQUEST
- [ ] Section 4: CANCELLED, COLD
- [ ] lifecycle-unsubscribe endpoint; orphan check in 9 AM digest
- [ ] Zapier cutover map + shadow comparison report (needs Zap names from Justin)
- [ ] Run the 10 DONE-WHEN checks with is_test contacts

## Zapier → app cutover (Oct 18) — shadow mode, nothing live
- [x] zap_cutover checklist table: all 44 Zaps seeded with state + app replacement; 357856538 blocked pending Justin's name check
- [x] New stages/templates: COLD, WELCOME, EVERY_VISIT, REVIEW, REFERRAL, PAYMENT_FAILED/RECOVERED, CARD_EXPIRING, CANCEL_REQUEST, PAUSE, CANCELLED, RETENTION_3M/6M, SKIP_PATTERN, OVERFLOW, MONTHLY_RECEIPT, CONVERTING objections 48h
- [x] /admin/messages: cutover checklist (status per Zap, live-since date), 7-day shadow report, "Zap replaced" tags on stages
- [ ] Event wiring: visit/payment/skip/retention triggers must call lifecycle-event (EVERY_VISIT steps are single event sends, not stage-entry blasts)
- [ ] Spanish drafts need review (es_reviewed=false on all new templates)
- [ ] SMS rows wait for Twilio reactivation; Brevo Zaps stay ON until one real signup proves app sender
- [ ] Cut each Zap off one at a time after 7-day shadow comparison
