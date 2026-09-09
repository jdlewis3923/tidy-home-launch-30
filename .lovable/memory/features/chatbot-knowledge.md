---
name: Chatbot knowledge base rules
description: How to change the chatbot_knowledge row that answers the site widget, dashboard widget and inbound SMS
type: feature
---
`chatbot_knowledge` is customer-facing pricing. Both readers —
`supabase/functions/chat-assistant` and `_shared/support-assistant.ts` — take
`ORDER BY updated_at DESC LIMIT 1`, so the newest row answers the homepage
widget, the dashboard widget AND inbound SMS.

- NEVER fix it with string replacement. A replace that matches nothing succeeds
  silently, which is how a stale catalog ($159/$275/$459 cleaning,
  $85/$129/$195 lawn, a percentage bundle discount) survived four "fixes".
- Always INSERT a NEW row with the complete corrected content, then confirm it
  wins the `ORDER BY`.
- Every dollar figure must come from `src/lib/pricing-canon.ts` /
  `src/lib/addon-catalog.ts`. Guarded by `src/test/chatbot-knowledge-canon.test.ts`,
  which reads the live row's figures through the `chatbot-knowledge-figures`
  edge function and fails on anything outside canon.
- The KB forbids promising a first-visit date; customer copy (FAQ included) must
  match that.
