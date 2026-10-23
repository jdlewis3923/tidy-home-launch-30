---
name: transactional-messaging
description: Messaging state — lifecycle engine replaced Zapier; Twilio active since 19 Oct 2026; hiring SMS dry-run OFF
type: constraint
---

Current state (19 Oct 2026):

- **Twilio is ACTIVE.** Account reactivated 19 Oct; readiness probe all-pass, 10DLC campaign VERIFIED ("Tidy SMS Service", LOW_VOLUME). Sending number (786) 829-1141. A real test text was accepted (queued) the same day.
- **Hiring SMS dry-run is OFF** (`app_settings.sms_dry_run = "off"`). All hiring texts send for real. The Outbox page and Simulate reply remain for testing.
- **Lifecycle engine** (contacts/sequences/message_queue + `lifecycle-tick`) replaced Zapier for customer messaging; rows stay `live=false` (shadow) until flipped per the cutover checklist. Only exception: LinkedIn posts go through `LINKEDIN_ZAP_WEBHOOK_URL`.
- **Hiring sprint mode**: `hiring_sprint_set(on)` compresses all deadlines to 24 h with 12 h nudges; auto-off Thu 29 Oct 2026 11:59 PM ET. Toggle on /admin/hiring.
- **Invites**: /admin/hiring/invite pastes rows → `hiring-invite` creates/resends/reopens by phone, texts a tokenized /apply link (EN/ES).
- **Slots**: phone screens Mon–Fri evenings only (no Saturday). In-person interview day this week is Thu 29 Oct 2026 only (10 AM–2 PM ET, hourly); not Wed 28.
- Every candidate call/interview booking must alert Justin immediately (urgent tier).
- Candidate-facing texts must never mention Saturday, Nov 16, or Nov 30. Cleaning/lawn first visits Mon 23 Nov 2026; car care opens on demand (10 reservations).

Do NOT re-enable dry-run or reintroduce Zapier for customer messaging without Justin's say-so.
