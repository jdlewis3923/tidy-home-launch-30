# Roadmap

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
