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
- Existing route reminder checks minute 45 and sends only at 5:45 PM Miami Monday–Saturday; Saturday includes Monday. SMS plus app feed, Spanish copy, active-team recipients and test-Pro exclusion. Route text contains no street/code/home details. Central sender never bypasses Pro hours.

## Remaining before closed-loop release
The visible request specifies schedule and visit card; masked relay, new all-service pay rules and weather/damage workflows are not added under this scope. Existing check-in/pay flows remain unchanged. No Pro-role accounts exist: an operational assigned-Pro schedule-to-payday acceptance test requires an isolated test environment or eligible Pro account and assigned work; no live fixtures, customer messages or payouts were created to bypass that boundary. New work/GPS guards remain staged (`pro_loop_enabled=false`).

## Final scoped pass
- Translated schedule progress/bonuses/insurance/launch lines, visit headings/errors and booked scope; selected Miami dates/times, three navigation providers and existing install metadata retained.
- Paired team members and backups now share the scope-card assignment predicate. New assigned-only context shows existing home notes, rotation task, team names and saved zones; user-entered notes are rendered as plain text, never commands/HTML.
- Vehicle access refreshes and masks immediately at checkout. Night-before reminders include arrival windows in route order, use `user_lang`, exclude both test flags/archived records, and require an actual carrier ID before reporting SMS accepted.
- 37 focused tests passed; authenticated owner phone schedule and unassigned visit denial verified. Separate synthetic browser fixtures verified EN/ES paired visit details and phone/computer layout with no overflow/runtime errors. Synthetic fixtures do not establish real assignment, SMS delivery or payout.
- Nothing published; no real messages or charges sent. Home-screen support remains manifest-only, following the PWA skill (no offline cache added).