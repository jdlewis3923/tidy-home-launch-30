# Review bonus — $25 per member, paid Friday

## What changes for you
- **Admin → Review Bonuses**: a form to record a review (member, Pro named, review date, stars, pasted text). It shows a checklist of four checks, each one green or red: member has a completed visit, the named Pro served that member, rating is 5, and the member has never had a review bonus. **Approve** only works when all four are green. Approving adds a "Review bonus — $25" line to that Pro's next Friday payout and marks the member as used.
- **Pro record (admin)** and **Pro's own view**: a running total. Under the Pro Partner counter it reads "Review bonuses earned: $N". On approval the Pro gets the notification "Maria G. left a five-star review naming you — $25 on Friday." (member's first name plus last initial).
- **KPI page**: total reviews, reviews per 100 active members, and total review bonus paid, all under the growth section.
- **The same wording everywhere a Pro looks**: "Review bonus — $25. Every five-star Google review from a member you've served that names you pays $25, added to that Friday's deposit. One per member." It goes in the earnings section of all three Indeed descriptions, in Brevo 64 and 61 (earnings block), in the "you're all set" email (pay section), in the onboarding program, in the contractor agreement's compensation section (with a new-clause item on the lawyer list), and in the weekly pay summary. The summary names the bonus and the member when one is in that Friday's payout.
- **Retired bonuses**: search every Brevo template, the app copy and the job descriptions for a $200 referral bonus, a $100 attendance bonus and the old $50 review bonus. Remove any I find, add a regression test, and report what turned up.
- **Member review ask**: confirm and tighten the existing timing. The first ask goes after the 2nd completed visit by text and email, with one tap to the Google review link. One reminder goes after visit 5 if they haven't acted, then never again. A review ask and a referral ask never go out in the same week: if both fall in the same week, the referral ask waits.

## Retiring the old rules
The current review-bonus system has a **4-per-month cap per Pro** and a **7-day hold**. Both will be removed. The one-per-member rule replaces them, as you specified. Bonuses that were already approved stay as they are.

## Test (then deleted)
Create a test member with one completed visit, served by a test Pro. Record a five-star review naming that Pro and approve it. Then confirm: the $25 line labelled "Review bonus" appears on the Pro's next Friday payout, the member is marked used, a second attempt for the same member is refused, and the Pro's view shows the notification and the total. All test records are then deleted. No real emails or texts are sent. Any Brevo template edits are checked for official-logo and light-mode compliance before saving.

## Technical details
- Database migration: add `review_bonus_member_id` (unique, partial where status in pending/paid) on `pro_bonuses` to enforce one per member; link to `payout_weeks` via the next-Friday week; set `app_settings.review_bonus` to amount 2500 with no cap and no hold; add a `review_bonus_member_uses` view; add the legal_review_items row and append the chatbot canon row.
- `reviews-review-action`: server-side four-check validation that returns each failure reason; insert the bonus into the next Friday payout week with `credit_payout_week`; create a `pro_notifications` row. Remove the cap and hold logic.
- New admin page section (extend `AdminReviews`) with a member/Pro picker and a live checklist from a `review_bonus_precheck` RPC.
- `ReviewBonusCard`, `ProDashboard` partner strip, `ProPayoutWeek`/`ProEarnings`: show the total and labelled line.
- One shared wording constant, mirrored to edge functions with a parity test. Used by `pro-emails.ts`, the Indeed templates (`job_listing_templates`), the onboarding sequence and the contract copy.
- `member-followups.ts`: enforce the visit-2/visit-5 caps and a 7-day separation from the referral ask.
