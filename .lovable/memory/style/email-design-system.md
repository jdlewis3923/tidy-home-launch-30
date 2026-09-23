---
name: Email design system
description: Light-mode-only Tidy email shell with logo, service banner, and a relevant hero icon focal point in every email
type: design
---

Every outgoing email — customer, Pro, applicant, owner/admin, alert, digest — uses the single shared shell in `supabase/functions/_shared/email-brand.ts`.

Rules:
- Light mode only. No dark/navy panels or hero overlays anywhere. Navy (#0f172a) is text only; backgrounds are white, #f6f9fc, #f4f8fc, or a soft topic tint.
- Official full TIDY wordmark only: https://jointidy.co/tidy-logo-email.png. Never use the favicon/standalone T, GitHub-hosted art, or any substitute logo.
- Structure: white header with logo + "More life. Less chores.", gold hairline, white Cleaning/Lawn/Car Care icon strip, hero art band, content cards, light legal footer.
- Every email has a visual focal point: a large relevant icon inside a white circle on a soft gradient tint, chosen by `pickEmailArt()` from the subject (background check, insurance, kit, visit, billing, reviews, referrals, hiring, digest, alert, account, welcome).
- Never plain/boring text emails. No emails without art.
- Footer: Tidy Home Concierge LLC · 2121 Biscayne Blvd #1562, Miami, FL 33137 · jointidy.co · (786) 829-1141.
- Mobile-safe: table layout, inline styles, Arial fallbacks, light-only color-scheme meta.
- Hosted Brevo templates are upgraded in place by `brandHostedTemplate()` via the `brevo-brand-audit` function; IDs, subjects, and merge fields are never altered.
- Every hosted-template send runs a fail-closed preflight: repair branding first, or block the send. A marker alone can never bypass validation.
