# Standardize every Tidy email

## Goal
Make every email sent by Tidy—customer, applicant, Pro, owner/admin, alert, digest, and account email—use one polished Tidy visual language based on the established customer design.

## Scope
1. **Complete inventory**
   - Trace every send path, live Brevo template ID, code-generated HTML email, scheduled digest, alert, test sender, and account/auth email.
   - Record each email's recipient, trigger, source, merge fields, and current branding state so none are skipped.

2. **One canonical email design**
   - Build an email-client-safe shared shell with the proper Tidy logo, navy header, gold accent, small white service-icon banner, structured white content area, CTA treatment, and the established legal footer.
   - Provide reusable blocks for headings, detail rows, status notices, buttons, bilingual sections, and dense admin summaries.
   - Keep all existing business copy, prices, pay details, recipient rules, and triggers unchanged unless a layout-only adjustment is necessary.

3. **Code-generated emails**
   - Replace every standalone/plain inline layout with the shared shell, including applications, hiring actions, onboarding reminders, kit notices, Checkr/COI notices, ratings, substitutions, add-ons, KPI/capacity/review digests, and critical alerts.
   - Escape dynamic content consistently and preserve links, attachments, logging, retries, and suppression behavior.

4. **Live templates and account emails**
   - Read each registered Brevo template live before editing it.
   - Update templates in place, preserving template IDs, subjects where appropriate, required merge variables, conditional sections, and automation compatibility.
   - Apply the same branding to sign-in, password-reset, confirmation, and other account emails through the supported account-email template flow.

5. **Verification**
   - Add tests that enumerate all send paths and reject raw/unbranded HTML outside the shared renderer.
   - Verify required template parameters remain intact and local mirrors stay synchronized.
   - Send representative tests for customer, applicant, Pro, and owner/admin email types; inspect desktop and mobile rendering.
   - Re-run the full relevant test suite, confirm the app build is healthy, and report every changed file and live template ID.

## Technical details
- Keep the existing consolidated sender, sender identity, retry policy, suppression checks, and email logs.
- Use stable `jointidy.co` image URLs and email-safe inline/table markup; no remote CSS or fragile client-dependent layout.
- Do not alter Zapier, pricing, Stripe, subscriptions, customer-facing website copy, or `send-documenso-envelope`.
- Do not expose or rotate credentials. If a provider rejects an authorized update, stop at the credential boundary and request access through the secure connection flow.