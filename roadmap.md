# Tidy roadmap

## In progress

1. Secrets
   - CHECKR_API_KEY / CHECKR_PACKAGE / CHECKR_WEBHOOK_SECRET — user has no Checkr account yet; do NOT ask again
   - TWILIO_FROM_NUMBER — awaiting confirmation that (786) 829-1141 is the permanent sending number
   - BREVO_TEMPLATE_WELCOME_T1 — user declined to add now; code falls back to app_settings.brevo_template_welcome_t1
   - TWILIO_FROM_NUMBER — user declined to add now; code logs clear error when missing

## Completed

- /apply Indeed-style gates (bilingual, insurance, FL license + expiry) with client and server-side hard-disqualifiers
- Badge admin panel (/admin/badges, status log, suspended/revoked states) wired to public /verify
- Command "Needs attention" panel (orphan/retired-SKU customers)
- Site gate header reads real `site_live` value (DARK / WAITLIST / LIVE)

## Launch (Sep 5 2026)
- [x] Turn site live (site_live = true)
- [x] Only House Cleaning selectable as a service until lawn/detail Pros are hired (see src/lib/service-availability.ts)
