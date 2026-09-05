# Tidy roadmap

## In progress

### Prompt 4 — Part 1: edge function hardening
- [ ] Wrap every handler body in try/catch; log to integration_logs; return 200 { ok:false, error } instead of throwing
- [ ] Read env vars inside the handler, never at module scope
- [ ] Missing var -> named error "MISSING_ENV: X", return 200 ok:false
- [ ] GET /health branch per function returning { ok, missing_env: [...] }
- [ ] Report which functions were throwing and why

### Prompt 4 — Part 2: Brevo template-only email
- [ ] Secrets: BREVO_API_KEY, TWILIO_FROM_NUMBER, CHECKR_* (Checkr: user has none, do not ask)
- [ ] send-brevo-email function: { template_id, to, params }, reject htmlContent, log all sends/failures
- [ ] src/lib/emailTemplates.ts registry (EMAIL const); no numeric template literals elsewhere
- [ ] documenso-webhook: drop BREVO_TEMPLATE_WELCOME_T1 + app_settings path, use EMAIL.CONTRACTOR_WELCOME_T1
- [ ] Remove every inline email HTML fallback repo-wide
- [ ] Required-params contract per template, fail loudly
- [ ] Health section: row per secret + per edge function (configured/missing + last success)


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
