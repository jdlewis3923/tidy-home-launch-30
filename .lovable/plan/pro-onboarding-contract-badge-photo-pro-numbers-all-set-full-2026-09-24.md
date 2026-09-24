# Pro onboarding: contract, badge photo, Pro numbers, "all set", full editing, send-any-email

All emails use the locked Tidy standard: light mode, official TIDY wordmark, service strip, focal art. English above Spanish. Nothing auto-texts; alerts written to the database first. No price, Stripe, Zapier or send-documenso-envelope changes.

## 1. Contract signing — /contract/:token
- Public token page (added to the always-open list), shows the current Independent Contractor Agreement from the Documents Library, scrollable, with download.
- Pro types full legal name, ticks agreement, clicks Sign. Stored: name, time, IP, browser, exact document version.
- On sign: signed PDF with appended signature page saved to the record; copy emailed to the Pro and hello@jointidy.co; stage moves to contracts_done.
- Legal review list gets a "typed-signature flow" item beside the other ICA items.

## 2. Badge photo — /photo/:token
- Photo rules (green Do list, red Don't list, original-not-screenshot line, what the photo is for) written into the email body and repeated on the page.
- Accepts JPG/PNG/HEIC up to 15 MB; badge-shaped preview with Retake; submit saves, shows in /admin/badges, emails you.
- Admin: Approve, or Ask for another with a reason list (too dark, too far, background, hat/sunglasses, blurry, not facing camera) — one email.
- Existing /badge/:token keeps working (redirects to the new page).
- Badge Photo Guide PDF registered in Documents Library under Contractor Onboarding as reference only.

## 3. Pro numbers
- TIDY-0001 format, sequential, never reused, assigned at contracts_done. Shown on the record, badge and Pros list.
- Test records are flagged and never take a real number. Katia reserved TIDY-0001.

## 4. "You're all set" email
- Fires once when all five are true: background clear, insurance verified, contract signed, intake submitted, photo approved.
- Content exactly as specified (ticked items, Pro number meaning, shipping + expected date, first route, pay, insurance reimbursement, support hours).

## 5. Missing-items chase
- Daily 9:15 AM ET: one email per Pro listing only outstanding items with the right buttons, at day 2 and day 5, then stop and raise an admin "call them" alert.

## 6. Edit every field
- Inline click-edit-save on the whole applicant/Pro record for every listed field; gate answers as yes/no/unknown with a "Confirmed on call" button (records "yes, confirmed by Justin on date").
- Score/tier recompute on save; manual override flag so the nightly job never undoes it.
- Audit line per change (field, old to new, when, who) on the record and in Workday.
- Bulk stage and queue-state edit from the list.

## 7. Send menu
- On every record: every email (onboarding, background invite, insurance request, contract, badge photo, all set, missing chase, decline, Tier 2 offer), each with filled-in preview, Send now or Copy text, and an English or Spanish-only version.
- Every send logged to the email log and Workday. Nothing sends without a click.

## 8. Test and report
- One test Pro end to end, five inline edits including a confirmed-on-call gate, one Send-menu email shown in the log, then delete and confirm TIDY-0001 is free.

## Items I will verify before writing copy
- Cleaning pay $56 / $76 / $112 and the $50/month x 3 insurance reimbursement against the locked pay canon; if they differ I stop and ask.
- Lawn and Car Care Pros: the "all set" pay line uses their locked figures from canon.

## Technical details
- Migration: contract_signatures table (name, ip, ua, doc version, pdf path), applicants columns (contract_token, photo_token reuse of pro_kit, pro_number, is_test, score_overridden, gate confirmation fields, all_set_sent_at, chase stage/timestamps), pro_number sequence + assign function, applicant_field_audit table; RLS admin-only; GRANTs.
- Edge functions: contract-load/contract-sign (pdf-lib), badge photo upload update (15 MB, HEIC), badge-photo-decision, pro-all-set-check (called on each gate change), pro-missing-chase cron at 13:15 UTC, onboarding-email-send extended with new kinds + lang=es + copy-text output.
- Admin UI: InlineField component, audit panel, Send menu dropdown, bulk bar in list view.
