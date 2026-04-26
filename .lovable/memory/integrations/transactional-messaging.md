---
name: transactional-messaging
description: Email and SMS architecture — fire Zapier webhooks only, never call Brevo/Twilio/Resend directly from edge functions
type: constraint
---

Tidy already operates a complete transactional-messaging stack outside Lovable:

- **Brevo**: 14 pre-built templates + automations for PRE-1 through L12 sequences.
- **Twilio**: SMS sends are handled inside existing Zaps (e.g., Zap 3 on Stripe payment, Zap 9 on Jobber visit complete).
- **Zapier**: orchestrates Brevo template send + status updates + Twilio SMS for every customer-facing message.

**Architecture rule for Phase 4 (email) and Phase 5 (SMS):**

- Edge functions MUST NOT call Brevo, Twilio, or Resend directly.
- Edge functions MUST fire a Zapier webhook for each key event; the existing Zaps do the actual send.
- Build ONE shared edge function: `send-zapier-event(event_name, payload)` that routes to the correct webhook URL based on `event_name`.
- Each event's Zapier webhook URL is stored as its own runtime secret (one secret per event, e.g. `ZAP_SUBSCRIPTION_CONFIRMED_URL`, `ZAP_VISIT_COMPLETE_URL`, `ZAP_PAYMENT_FAILED_URL`, etc.).
- Call `send-zapier-event` from: `stripe-webhook`, `jobber-webhook`, `account-provisioning`, and any future server-side trigger.

**Why:** Avoid duplicating template/sender logic that already lives in Brevo + Zapier. Lovable's role is event emission and observability (`integration_logs`), not message rendering or delivery.

**Do NOT:**
- Add the Resend connector.
- Verify an email-sending domain through Lovable.
- Build React Email templates.
- Call the Brevo or Twilio APIs from edge functions.

The 7 (or so) key event names will be finalized at Phase 4 kickoff before any webhook secrets are added.
