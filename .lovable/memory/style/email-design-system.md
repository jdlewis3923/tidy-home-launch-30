---
name: Email design system
description: Light-mode-only Tidy email shell with logo, service banner, and a relevant hero icon focal point in every email
type: design
---

Customer, Pro and applicant emails use the shared shell in `supabase/functions/_shared/email-brand.ts`. Owner/admin alerts and digests use a separate Daily Signal design, not the customer shell.

Rules:
- Light mode only. No dark/navy panels or hero overlays anywhere. Navy (#0f172a) is text only; backgrounds are white, #f6f9fc, #f4f8fc, or a soft topic tint.
- Official full TIDY wordmark only, served from the permanent public email asset. Never use the favicon/standalone T, GitHub-hosted art, or any substitute logo.
- Structure: white header with logo + "More life. Less chores.", gold hairline, white Cleaning/Lawn/Car Care icon strip, hero art band, content cards, light legal footer.
- Every email has a visual focal point: a large relevant icon inside a white circle on a soft gradient tint, chosen by `pickEmailArt()` from the subject (background check, insurance, kit, visit, billing, reviews, referrals, hiring, digest, alert, account, welcome).
- Never plain/boring text emails. No emails without art.
- Footer: Tidy Home Concierge LLC · 2121 Biscayne Blvd #1562, Miami, FL 33137 · jointidy.co · (786) 829-1141.
- Mobile-safe: table layout, inline styles, Arial fallbacks, light-only color-scheme meta.
- Hosted Brevo templates are upgraded in place by `brandHostedTemplate()` via the `brevo-brand-audit` function; IDs, subjects, and merge fields are never altered.
- Every hosted-template send runs a fail-closed preflight: repair branding first, or block the send. A marker alone can never bypass validation.

## Visual focal point (updated)
- Every email opens with a full-width photographic banner (light, bright Miami scenes) chosen by topic via pickEmailArt(). Photos live in the public social-images bucket under brand/email/.
- Emoji or icon-circle hero art is retired — user found it cheap. Never use emojis as the focal point or in the service strip.
- Service strip is text only: CLEANING · LAWN · CAR CARE with gold dots.

## White-only + info tiles (Oct 18)
- Every surface is locked white against phone dark mode (gradient backgrounds + dark-mode overrides). Never grey/dark on mobile.
- Emails show a relevant photo plus blue line-icon fact tiles (date, plan, price, area, size) for the details that email mentions. No emojis.
- Subject is never repeated as a second heading; the main link becomes the gold button.
- Every email surface must be white and every primary button website gold (#f5c518), including phone dark mode. Never promise a client-independent guarantee without testing the actual phone email app.
- Header artwork must match the message's intent, not merely a service word: team introductions show diverse AI people in Tidy uniforms; support alerts show support; billing shows billing. Repeat artwork only for congruent intents.

## Owner Daily Signal (Oct 20)
- Match Justin's uploaded Daily Signal reference: logo/date header, wide Miami-home banner, four Pulse columns, yellow attention panel with compact pill actions, three service-photo operations columns, red unresolved panel, numbered CEO priorities, skyline sign-off.
- White email background is the explicit requirement, overriding the reference's dark background; keep blue, yellow, green and red accents and reference proportions.
- All numbers and priorities must be real; never reuse the reference's sample counts, test candidate or test insurance lapse as real data.
- Resolved and test items are excluded, not merely moved to a long history list in the email.
- Do not claim Outlook Android is guaranteed white until Justin checks a freshly sent message there; email-app chrome cannot be controlled by the sender.
