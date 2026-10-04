# Service landing page corrections

## Changes
- Update the three service headlines to the supplied category wording, using “&” instead of “+”.
- Restore “Shine Complete” only as the car-page subtitle.
- Change the shared service-page image overlay to the specified lighter top-to-60% navy fade, then verify headline contrast.
- Replace the bundle-page photo with the same solid navy visual ground used by the referral page.
- Change all three main service-page buttons to “Reserve your spot →” and the supporting line to “No card, no account · First visits begin Monday, Nov 16”.
- Update the single launch-date source and its required mirror from November 9 to November 16 so the reservation experience does not contradict the landing pages.

## Verification
- Check all three service pages and the bundle page at phone and desktop widths.
- Confirm the exact headline, subtitle, button, date line, image treatment, and at least 4.5:1 headline contrast.
- Run the focused launch parity checks and confirm the preview build is clean.

## Technical details
- Keep pricing, plan IDs, Stripe data, routes, and reservation behavior unchanged.
- Use the shared landing-page implementation for the overlay and reservation CTA so the three pages cannot drift.
