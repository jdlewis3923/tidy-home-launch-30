# Cleaning expansion — verification and remaining work

## Verified on October 27, 2026
- 90 focused tests pass across cleaning sizes/prices, checkout wiring, team eligibility, pay calculations, exact guide parity, owner digest rules and prepaid refund math.
- Preview reports build OK.
- Full English and Spanish Member Guide renders on desktop and 390px phone without horizontal overflow.
- Signed-in owner Reservations page renders; walkthrough calendar permission warning corrected.
- Owner-only eligible cleaning Pro options return successfully; no eligible active cleaning Pros currently available. Missing team fails the conversion gate.
- Payment, consent, guide welcome, Pro visit, chatbot/support and owner digest changes deployed; site not published.
- No customer/candidate messages or charges made during this work.

## Added in this continuation
- Exact bilingual Member Guide and required recorded checkout acknowledgement, dashboard/Billing links, welcome copy, FAQ answers and grounded public/support chatbot instructions.
- Verified owner-helper and paired-Pro team records; owner registration/selection and Estate Plus conversion guard.
- Estate arrival windows and team-aware capacity checks after schedule assignment.
- Lead room zones/final inspection, paired individual GPS check-in/out and shared team visit-photo access.
- Deduplicated, transactionally credited private pay lines: base, first visit, partial, tier adjustment and default-Lead add-on pay; Pro statements/display use individual amounts.
- Gift pay retained when recalculating cleaning visit pay.
- Bilingual standard and secure-exit checklist; five-task member rotation; secure exit gates completion.
- Existing 9 AM owner digest includes Estate Plus reservations needing teams.
- Started-month annual refund math fixed for anniversary times and month-end starts; undo cancellation preserves active pause state.

## Stripe evidence (Oct 27)
- Live catalog check rebuilt for the five cleaning bands and run against live Stripe: all 45 recurring keys (monthly + annual) resolve to active prices at exact canon amounts; standard bundle ($393.00) and Estate weekly ($1,396.00) reference carts match; no archived price is selectable.
- Test-mode money lifecycle proven twice against real catalog test prices (clean_2_biweekly $348.00 and clean_estate_weekly $1,396.00): subscription active, first invoice paid at the exact amount, partial refund succeeded, subscription canceled, throwaway customer deleted. No live charges.

## Access, photos, claims and credits (Oct 27, later)
- Entry codes and access notes are encrypted at rest (pgcrypto; key in a table with no client access). Booking entry details move into an encrypted blob at booking time; Pros decrypt only on visit day; day-of texts decrypt server-side; members read/update only their own code through server functions. All plaintext copies cleared; round-trip verified.
- Visit photos are deleted after 30 days by a daily 6:30 AM ET job (registered, first run is a no-op — no photos exist yet); photos on visits with open claims are kept, claim photos purge 30 days after the claim closes. Members get a notification when a claim is resolved.
- Member credit ledger: skips (48h+ notice, max 2 per year per service) issue a real Stripe customer-balance credit that comes off the next bill; the first lockout each year is credited automatically with a member notice, later lockouts are charged with a notice. Pending credits retry daily. Test-mode proof: charge $348.00, partial refund, and a balance credit all succeeded against real catalog prices.

## Add-ons and team backup (Oct 27, later still)
- All seven new cleaning add-ons are live: Blinds & Shutters $55, Fans & Fixtures $45, Wall & Door Spots $45, Patio/Lanai & Furniture $55, Linen & Bed Making $25 (all gift-eligible), Garage Sweep & Tidy $65 and Pantry/Closet $75 (not gift-eligible). Stripe products/prices created with lookup keys; Pro pay is 40% of each price. They appear automatically in the member add-on picker, free-gift picker, Pro request flow and services page, which all read the catalog. Chandelier and pre-guest deep reset stay walkthrough-quote only (no price, by design).
- Missing teammate: the Lead reports a no-show partner from the visit; the owner gets an urgent alert and resolves it with either a checked backup Pro (active, cleaning, never a test record) or a move within 48 hours. The member gets a text in their language either way, and the backup Pro can check in/out with GPS and counts as the second required person for completion.

## Storm days, payments, home notes, photos, seals (Oct 27, final pass)
- Storm warning day: one owner action blacks out all three services in the ZIP and credits every affected visit in full — never counts as a skip — with a bilingual member text for each home.
- Failed payment: immediate bilingual text on any failure; after 7 unpaid days upcoming visits pause automatically (the plan and price stay untouched, no Pro is ever assigned unpaid work); a successful payment puts the visits back with a member text. Runs inside the daily member job.
- Home notes: members write persistent notes on the Account page; every assigned Pro (including backups and team partners) sees them on the job screen, falling back to the existing "notes for your Pro".
- Photo reports: members opt in on the Account page; after each completed visit they get a notice that before/after photos are ready, and photos still auto-delete after 30 days.
- Founding seal delivery is tracked per home (pending → shipped → delivered) on the founding registry, with each change logged.

## Not complete
- Annual subscription lifecycle, refund ledger and 45-day renewal notices. Annual collection remains blocked.
- Per-add-on assigned/together completion, responsible-zone redos, named review split/rating propagation, route household counts and full payout journey evidence.
- Full hiring/onboarding/agreement/document copy inventory and remaining bilingual cross-surface checks (add-on names currently display in English only, same as the existing add-ons).

## Verification limitation
No active eligible cleaning Pros exist to run a real Estate team appointment through completion. Rule tests and owner eligibility checks are not a substitute for that operational journey.