# Align printed service claims with the product

## Changes
- Update Terms to “Notify us within 48 hours of any service issue” and add an admin legal-review entry marked as a wording change already made.
- Keep the existing server-side before/after photo completion gate, then replace the member dashboard’s placeholder image with the visit’s real private photos and add a visit-record view.
- Preserve the existing single-subscription, multi-line-item checkout for new bundles. Repair the add-service path so it updates the member’s existing subscription instead of creating another subscription and charge.
- Replace customer-facing, account, chatbot, social, and email-source wording that implies one person performs every service with “the same pro for each service, every visit,” including a natural Spanish version.

## Verification
- Add focused tests for the photo gate/member photo access, one-subscription add-service behavior, and prohibited “one Pro” wording.
- Run the relevant test suite and verify the member visit record in the browser with authenticated data when available.

## Technical notes
- Visit photos remain private and are shown through short-lived signed links only.
- Billing keeps each service as a line item on one Stripe subscription/invoice; prices, product IDs, and the current reservation flow remain unchanged.
- Historical migrations stay immutable; a new migration records the legal-review item and any required access policy changes.
