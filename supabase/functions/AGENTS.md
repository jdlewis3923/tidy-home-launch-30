- Failed or expired texts always raise an admin alert via `_shared/sms-failure.ts` (direct sends in send-twilio-sms, queued ones in sms-outbox-release) — why: no text ever fails silently.
- Inbox redos go through `redo-request` with `message_id`; the clock starts at the member's message time — why: the guarantee promises "reply here within 48 hours".
- Car Care Stripe pay audits run through `car-care-pay-metadata`, using the shared pay canon across live/test and active/archived prices without changing amounts or activation; unidentifiable retired pay metadata is removed rather than mapped to invented vehicle sizes — why: pay stays per job and legacy bands cannot silently reintroduce wrong rates.
- Owner contact goes only through `admin-alert-dispatch` (urgent on insert, hourly reminders, 9 AM/9 PM ET digests); brevo-send and send-twilio-sms hold any other owner-bound mail/text as a digest alert unless `adminChannel`/`admin_channel` is set — why: two digests a day, urgent only in between.
- Owner digests report applications from submission timestamps and exclude both test flags; watchdog failures reuse stable keys and clear only on verified recovery — why: completion is an event, not an unresolved failure.

- Email-brand owns customer art/surfaces; owner-email renders owner-only authorized channels unchanged by brevo-send — why: reports differ from customer mail; raster fills resist phone inversion.
- Candidate messages use `pipeline-notify` and stage-owned gates; legacy senders use `pipeline-gate` — why: documents and spending follow proof approval.
- Social-launch-publisher alone posts ledger-locked images/copy; social-plan sets dates unless manually moved — why: no competing sends.
- LinkedIn calendar rows are independent manual-schedule rows; webhook acceptance stays unconfirmed until a per-attempt token receipt supplies the real LinkedIn ID/URL — why: asynchronous Zap acceptance must never masquerade as a published post.
