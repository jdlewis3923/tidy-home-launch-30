# Tidy OPS — Part A audit and Part B gate

Audit: October 28, 2026, approximately 02:00 UTC. This is an initial evidence-backed inventory, not a completed acceptance certificate.

## Status definitions

- **PASS**: the named check actually ran and passed; scope is stated.
- **FAIL**: observed mismatch with the brief.
- **NOT BUILT**: the requested behavior is absent from the inspected implementation.
- **UNVERIFIED**: implementation exists or may exist, but required operational/provider/device evidence is missing. This is not PASS.

## Evidence collected

- Full existing suite: **52 files / 440 tests passed** after correcting the launch-date regression. Output: `/tmp/tidy-full-audit-tests.log`.
- After approved timing changes: **54 files / 448 tests passed**, including five route/owner boundary tests. Output: `/tmp/tidy-route-full-tests.log`. Existing route schedule verified active at minute 45; changed notification functions deployed. No send invoked.
- New courtesy-hours suite: **3 tests passed**, covering 8 AM opening, 6 PM closure, Saturday/Sunday and daylight saving time. With launch/lifecycle checks: **16 passed**. Output: `/tmp/tidy-audit-final-tests.log`.
- Preview reported **build OK** after edits. Owner `/admin/agents` opened with authenticated owner session; corrected claim visible; no page errors.
- Three founding ZIP links returned HTTP 200 in a 390×844 Chromium phone viewport; English and Spanish headings rendered without horizontal overflow or page errors. First-contentful-paint measurements: **1,348 / 968 / 496 ms** locally. This is not a throttled production-phone performance measurement.
- `/robots.txt` and `/sitemap.xml` returned HTTP 200 locally.
- Live catalog: **59 active entries, zero missing lookup keys**. This does not prove all provider-side active/archived prices and metadata.
- Live scheduled jobs: **17,274 recorded runs in the previous seven days, zero recorded HTTP/error/timeout failures**. Missing/unrecorded runs still require a separate coverage audit.
- LinkedIn: **6 posted records**, 6 external IDs, 5 stored LinkedIn URLs; **4 unconfirmed**. An owner-verified historical post may have no stored URL; none was invented. Meta: 4 posted, 6 missed, 1 blocked. No retry or publication was triggered.
- SMS: six unique accepted IDs visible across the inspected send/outbox records this Eastern week; **zero delivered/failed receipts matched, six unconfirmed**. Delivery percentage and “under 5% failures” cannot be proven without receipts. This is not a comprehensive provider-side traffic audit.
- Lifecycle settings: `shadow=on`, no live stages; cutover inventory: **42 shadow / 8 retired**. **85 active templates lack Spanish-review approval**.

## Part A

### 1. Hiring

| Check | Status | Evidence / remaining work |
|---|---|---|
| Call-first flow, application after phone screen | NOT BUILT as specified | Existing application-first/campaign flows remain. The new order must be added without rewriting existing candidate journeys. |
| Booking link | UNVERIFIED operationally | Existing `hiring-candidate`, Pro booking page and slot RPCs; `candidate-appointments.test.ts` passed. No new booking-to-phone-screen journey performed. |
| Shortened application | PASS — rules only | `application-remaining.test.ts`, `application-v6.test.ts` passed; pinned answers retained. |
| Fit Report | PASS — scoring/answer helpers only | `hiring-score.test.ts`, `applicant-answers.test.ts` passed. Final phone-screen/owner flow not retested. |
| Instant hiring alerts | UNVERIFIED delivery | Transactional booking alert exists; prior SQL evidence is retained. No new carrier-delivery test conducted. |
| Sprint mode | UNVERIFIED current behavior | Existing sprint-aware deadlines and hiring tick; expiry/current configured state not exercised here. |
| Invite page | UNVERIFIED operationally | Existing invitation page/sender. No new candidate imported or contacted. |
| Spanish application | PASS — rules; UNVERIFIED full new journey | Bilingual v6 helpers passed; full eight-step Spanish submission not repeated in this audit. |

### 2. Website

| Check | Status | Evidence / remaining work |
|---|---|---|
| Cleaning sizes and Estate prices everywhere | UNVERIFIED whole-site coverage | Pricing, cleaning Estate, checkout and size tests passed. Every page/message/catalog screen still needs inventory comparison. |
| Member Guide EN/ES everywhere | PASS — exact mirror; UNVERIFIED placement completeness | `member-guide-parity.test.ts` passed. Guide page, FAQ, Billing, checkout links exist; welcome/dashboard/all surfaces not retested. |
| Checkout policy checkbox | UNVERIFIED operationally | Persisted guide acknowledgement exists in `StepPayment`; payment refusal/readback not exercised this pass. |
| Three hanger destinations | PASS — tested ZIP URLs only | Founding URLs for 33156/33183/33186 returned 200. Actual three printed URLs must be matched, not assumed equivalent to tested URLs. |
| Attribution saved | PASS — URL rules; UNVERIFIED reservation readback | QR/funnel/gate tests passed. No test reservation submitted to confirm saved source this pass. |
| Robots and sitemap | PASS — local access/basic robots rule | Robots allows public root and disallows `/admin/`; both files return 200. Search-crawler production behavior and automatic sitemap update not proven. |
| Mobile speed below 3 seconds | UNVERIFIED production | Local phone first-contentful paint below 1.4 seconds. No physical phone, slow-network or production LCP acceptance yet. |
| Launch dates | PASS — corrected regression | Simulator and lifecycle email test tokens now read configured launch dates; approved guide-version and fixed hiring-campaign dates preserved. Launch parity passes. |

### 3. Stripe

| Check | Status | Evidence / remaining work |
|---|---|---|
| Lookup keys on every price | PASS — active app catalog; UNVERIFIED provider catalog | 59 active entries, no missing keys; archived/live/test provider inventory not freshly queried. |
| `contractor_pay` / `budget_hours` metadata | UNVERIFIED all provider prices | Existing `car-care-pay-metadata` and `verify-checkout-wiring`; focused parity/pay tests passed. No metadata mutation performed. |
| Estate and prepaid prices | PASS — canon/math; UNVERIFIED complete checkout | Estate/prepaid/pricing tests passed. Financial lifecycle must be exercised with test payments. |
| New add-ons | PASS — names/pricing rules; UNVERIFIED complete booking/pay | Bilingual add-on and cleaning pay tests passed. Assigned/together completion-to-statement not run. |
| Skip credits | PASS — rules; UNVERIFIED Stripe operational flow | Cleaning-operation tests and credit ledger implementation exist. |
| Pause/resume | UNVERIFIED operationally | Existing pause and billing handlers; no new lifecycle exercised. |
| Failed-payment day-7 pause/recovery | UNVERIFIED operationally | `member-ops-tick` calls `payment_pause_tick`; provider event → pause → success → resume not exercised. |
| Prepaid refund math | PASS — helper math only | Prepaid year tests passed. Charge/refund/renewal notices/anniversary behavior needs fresh isolated operational evidence. |

### 4. Messaging

| Check | Status | Evidence / remaining work |
|---|---|---|
| Lifecycle sequences and cutover | PASS — shadow safety; UNVERIFIED live replacement | Tests pass; live settings remain shadow, 42 shadow cutovers and 8 retired. No cutover enabled. |
| 8 AM–6 PM Mon–Sat, never Sunday | PASS — timing helpers and sender guard; UNVERIFIED carrier boundary | Approved change implemented: route texts 5:45 PM, Saturday includes Monday; central sender ignores bypass flags for non-owner destinations, including urgent Pro/retry callers. Owner window separately 8 AM–9 PM, including 9 PM digest minute. Outbox crossing closure stays queued, not falsely sent. No live boundary text sent. |
| Spanish messaging | FAIL — unreviewed inventory | 85 active templates lack Spanish approval; sender may fall back to English. No blanket review approval assigned without reviewing copy. |
| Twilio delivery rate this week | UNVERIFIED | Six accepted IDs in inspected logs, all without matched final receipts. No invented delivery rate. |

### 5–8. Social, roadmap and Pro

| Check | Status | Evidence / remaining work |
|---|---|---|
| Calendar order/no repeats | PASS — policy tests only | Social planner/publish policy and LinkedIn contract tests passed. External/native scheduling history not available. |
| LinkedIn confirmed photo + text links | FAIL — incomplete confirmation | Six posted records but only five stored URLs; four unconfirmed posts. Inspect receipts/Zap run results; never blindly resend. |
| Roadmap initiatives/switches | PASS — rules; UNVERIFIED kickoff delivery | Roadmap tests passed; existing tick and controls. No kickoff sent here. |
| Whole Pro closed loop | UNVERIFIED / incomplete | Existing portal, scoped visits, checklists, GPS reasons, reminders, pay screens; Pro/cron/digest tests passed. Masked relay, all-service exception/pay integration and authenticated assigned-Pro-to-payday acceptance remain open. New visit enforcement is staged off by default. |
| iPhone Safari GPS | UNVERIFIED — physical-device blocker | No physical phone available; permission/150 m/reason/denial/checkout/accuracy not measured. |
| Android Chrome GPS | UNVERIFIED — physical-device blocker | Same; Chromium emulation is not Android location evidence. |
| Test visit at owner's address | NOT CREATED | Address now confirmed and saved in private project memory; still need isolated authenticated test Pro/member and physical devices. Never put test work into live capacity/payout. |

## Failures corrected in this pass

1. Launch-date literals in lifecycle simulator and email test tokens: replaced with configured dates; regression rerun passed. Deployed the changed lifecycle function without invoking it or sending anything.
2. `/admin/agents` falsely claimed “6 agents … all running” based on KPI snapshots: now accurately says KPI monitoring, reports current indicator count, recent/stale data and last calculation rather than autonomous agent action. Authenticated owner browser proof captured.
3. Resolved the SMS courtesy-hour conflict using Justin's approved 5:45 PM timing; Monday route sent Saturday. Central sender rechecks all non-owner destinations despite bypass flags; owner channels remain separate. Existing schedule updated and verified, affected functions deployed, 448 tests pass.

## Part B — gated, not started

Per the brief, fix Part A failures before enabling/building the autonomous suite. Existing ticks/RPCs/ledgers are building blocks, not evidence of completed agents.

| Requested agent | Status / reusable implementation |
|---|---|
| Pay reconciler | NOT BUILT: visit evidence, anomaly thresholds, held lines, owner approval, Friday payout gate. Reuse existing private pay-line and statement logic. |
| Size verifier | PARTIAL: cleaning/lawn manual verification and atomic size consent exist. Missing per-reservation agent task/aging and car make/model confirmation. |
| On-job plan corrector | PARTIAL: size review and lawn swap exist; complete photo → consent → next-bill/next-visit change with booked-today preservation not proven. |
| Tomorrow guard | NOT BUILT as specified: reminder exists, not consolidated staffing/payment/access/COI/payout/rain checks and moves. |
| Late/no-show watcher | NOT BUILT as specified: 15/30 minute escalation and truthful ETA path needed. |
| Quality watcher | PARTIAL: existing FIX consent/redo/review logic. New automatic redo request must preserve member consent and shadow boundary; two-in-60-days threshold/report not verified. |
| Billing agent | PARTIAL: existing billing, credits, payment tick and annual notices. Consolidated run/action/exception proof missing. |
| Pro compliance | PARTIAL: insurance jobs/gates exist; full background/payout/COI assignment guard proof missing. |
| Capacity + hire trigger | PARTIAL: existing capacity and ten-reservation gates. Combined 85%, Estate weights, three-candidates-per-seat agent missing. |
| Hiring agent | NOT BUILT in new call-first form. Preserve old records and campaign-specific reminders while adding new flow. |
| Seal + first visit | PARTIAL: seal tracking and first-visit pay rules exist; automatic assignment/delivery exceptions not proven. |
| System health | PARTIAL: existing watchdog/cron health. Unified QR/provider metadata/delivery/social/failed-job evidence coverage missing. |
| Digests | PARTIAL: existing 9 AM/9 PM dispatcher and database-first alerts; unified agent exceptions/one-tap held-line actions not built. |
| Agent console and isolated run logs | NOT BUILT: current page remains accurately labeled KPI monitoring. No fake switches or fabricated run logs added. |

## Next acceptance work and blockers

- Fix/validate Spanish templates, LinkedIn confirmation and missing operational test coverage before Part B.
- Timing decision resolved: 5:45 PM routes Monday–Saturday, Saturday Monday notice; customer/Pro texts never Sunday, owner alerts separately 8 AM–9 PM. Real carrier boundary behavior remains untested.
- Test address confirmed; obtain real iPhone/Android participation and isolated test identities; report per-device accuracy, not fabricated values.
- Establish isolated authenticated Pro/member test data excluded from live capacity, assignments, messages and payouts; tests must not masquerade as real delivered texts or settled payouts.
- Preserve fixed old candidate campaigns and consent/price/payout gates. No app publication, candidate/member messages, social posts or charges were triggered in this audit.