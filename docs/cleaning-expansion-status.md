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

## Not complete
- Annual subscription lifecycle, refund ledger and 45-day renewal notices. Annual collection remains blocked.
- Team backup/move workflow, per-add-on assigned/together completion, responsible-zone redos, named review split/rating propagation, route household counts and full payout journey evidence.
- New cleaning add-on Stripe/catalog provisioning and all selection surfaces.
- Encrypted access card, seal delivery, opted-in reports and 30-day deletion, home notes and complete claim workflow.
- Enforced first annual lockout courtesy, reschedule/skip limits and actual Stripe credits, weather/payment/pause reminder journeys and policy-trigger notices.
- Full hiring/onboarding/agreement/document copy inventory and remaining bilingual cross-surface checks.

## Verification limitation
No active eligible cleaning Pros exist to run a real Estate team appointment through completion. Rule tests and owner eligibility checks are not a substitute for that operational journey.