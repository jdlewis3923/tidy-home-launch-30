# Tidy roadmap

## In progress

1. Secrets
   - CHECKR_API_KEY — pending (user will add when available)
   - CHECKR_PACKAGE — pending (user will add when available)
   - CHECKR_WEBHOOK_SECRET — pending (user will add when available)
   - BREVO_TEMPLATE_WELCOME_T1 — user declined to add now; code falls back to app_settings.brevo_template_welcome_t1
   - TWILIO_FROM_NUMBER — user declined to add now; code logs clear error when missing

## Completed

- /apply Indeed-style gates (bilingual, insurance, FL license + expiry) with client and server-side hard-disqualifiers
- Badge admin panel (/admin/badges, status log, suspended/revoked states) wired to public /verify
- Command "Needs attention" panel (orphan/retired-SKU customers)
- Site gate header reads real `site_live` value (DARK / WAITLIST / LIVE)
