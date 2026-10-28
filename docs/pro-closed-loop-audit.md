# Pro closed-loop audit — October 28, 2026

## Existing inventory
- Schedule: weekly route claims and date management; assigned-visit reader and COI start gate.
- Visit: member first name/address, window, estimated pay, booked scope/add-ons, lawn size, on-the-way member text, GPS check-in/completion, blocked report and first-visit size review.
- Cleaning: bilingual standard/rotation and secure exit, paired attendance, Lead inspection/zones, private pay lines, assigned/together add-on completion RPC.
- Photos: private uploads and consent-based member report, 30-day retention with claim preservation.
- After: member completion/rating/48-hour followups, redo requests, weekly pay, review bonuses, Partner progress, insurance expiry checks.
- Portal: notifications/messages/profile, Pro manifest/icons and home-screen installation prompt. No new offline cache is needed.

## Gaps confirmed in current code
- Today is not the first schedule view; visit addresses appear in lists; no three-provider navigation control.
- Codes are returned for the entire visit day, including after checkout; vehicle extras return unfiltered access fields.
- General GPS only records coordinates; no 150 m distance or outside-radius reason. No verified address coordinates are stored.
- Most portal controls are English only; global language toggle is missing.
- Template checklists explicitly do not gate completion; cleaning exit only is required. Team zones are description-only, not enforceably assigned.
- Non-cleaning lockout/unsafe reports still promise full pay; lockout contact/timer is not a complete masked call/text loop.
- Tomorrow producer comments specify 5 PM and push-first delivery, not the requested 6 PM SMS + app.
- Extra time, masked calling, damage/unsafe/weather control stack and service-wide exit checklist need closed-loop integration.
- Current browser evidence does not prove an authenticated is_test Pro journey for all services, paired attendance, member SMS outcomes or payout reconciliation.

## Safety boundaries
Preserve frozen customer prices/historical settled pay and the existing scheduling/payment pipeline. Do not enable shadow lifecycle campaigns or publish the website. Test data must not contact real members or enter real assignment/capacity/payout processes. A simulated text or statement is not provider delivery or bank settlement. Phone screenshots cannot be prevented by a website; minimize address/code exposure and never advertise screenshot prevention.

## Implemented in this pass
- Today/week route summary without street addresses; sizes/team Lead labels, restored check-in state, Google/Apple/Waze navigation and links to existing approved add-on workflow/home notes.
- Global language switch, Spanish bottom navigation and installation guidance. Full legacy page translation remains open.
- Server-gated code access starts 30 minutes before window and ends at visit/individual checkout; vehicle extras exclude gate/access data and gate interior access.
- Per-Pro service/exit checklist and explicit attached add-on completion, with server completion enforcement for designated closed-loop visits. Legacy visits retain their existing rules until rollout, avoiding a live-site/preview mismatch.
- 150 m GPS validation and recorded exception reasons, individual team evidence; missing verified address coordinates require a reason, never fabricate a location.
- Existing tomorrow reminder checks hourly and sends only at 6 PM Miami time with SMS plus app feed, Spanish copy, active-team recipients and test-Pro exclusion. Route text contains no street/code/home details.

## Remaining before closed-loop release
Masked Twilio call/text relay and callback authentication; lockout timer plus actual call/text and all-service half-pay; same-day damage contact; unsafe departure and weather moves; structured per-Pro zones; opt-in/evidence-photo policy reconciliation; all-service payout ledger and statistics; complete portal translation; verified COI/assignment gate inventory; admin-only isolated is_test setup and all requested phone screenshots. No Pro-role accounts were found in the database, so the signed-in owner portal check is not an operational Pro acceptance test. New work/GPS guards are staged per visit (`pro_loop_enabled=false` by default) until full loop verification and rollout.