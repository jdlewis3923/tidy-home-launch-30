# Contractor Insurance Compliance

Tidy requires active Pros to maintain qualifying liability coverage. Tidy is not an
insurer, does not underwrite coverage, and does not determine eligibility, premiums
or claims. Contractors may use any qualifying insurer or explore coverage through
Tidy's preferred insurance provider.

## Where it lives

| Layer | Location |
| --- | --- |
| Apply step | `src/components/apply/InsuranceStep.tsx` (rendered inside `src/pages/Apply.tsx`) |
| Contractor dashboard | `src/components/pro/InsuranceCard.tsx` |
| Admin review (in applicant drawer) | `src/components/admin/InsurancePanel.tsx` |
| Admin compliance console | `src/pages/AdminInsurance.tsx` → `/admin/insurance` |
| Shared frontend logic | `src/lib/insurance.ts` |
| Public config endpoint | `supabase/functions/insurance-config` |
| Submission (public) | `supabase/functions/submit-insurance` |
| Admin decisions | `supabase/functions/insurance-decision` |
| Daily expiry automation | `supabase/functions/insurance-expiry-check` (cron 13:00 UTC) |

## Data model

- `public.contractor_insurance` — one row per submitted policy (multiple policies per
  contractor supported): provider, carrier, policy number, coverage type, limits,
  effective/expiration dates, certificate path, Additional Insured status,
  verification status/method, verified_at/by, waiver fields, last_checked_at.
- `public.insurance_providers` — provider registry (provider-agnostic): key, display
  name, type, integration type, enabled, preferred, referral/embed URL, supported
  service categories, display order, disclosure text.
- `public.insurance_requirements` — one row per service category (`cleaning`, `lawn`,
  `detailing`): limits, Additional Insured requirement, accepted policy types,
  reminder day intervals, manual-verification flag.
- `public.insurance_audit_log` — every admin action (approve / request update /
  reject / waive / requirement change) with actor and internal reason. Admin-read only.
- `public.applicants.insurance_status` / `insurance_expires_at` — denormalised summary.
- `app_settings.insurance_additional_insured` — `additional_insured_legal_name`,
  address and certificate wording (admin-configurable, never hard-coded).

States: `not_started`, `coverage_needed`, `pending_verification`, `verified`,
`rejected`, `update_requested`, `expiring_soon`, `expired`, `waived`.
`waived` is admin-only and requires an internal reason (audited).

## Eligibility

`public.is_contractor_job_eligible(uuid)` is the authoritative server-side gate:
existing onboarding requirements **plus** (`insurance_status = 'verified'` with a
future expiration) **or** an explicit admin waiver. Expired coverage removes job
eligibility only — accounts, history, earnings and reviews are never deleted, and
eligibility restores automatically once replacement coverage is verified.

## Expiration automation

`insurance-expiry-check` runs daily and, per the configured `reminder_days`
(default 30/14/7), emails the contractor through the existing Brevo pipeline,
flips records to `expiring_soon`, and marks them `expired` on/after the expiration
date. Notification channels are driven by the existing messaging infrastructure, so
SMS/push/in-app can be added without touching the insurance logic.

## Security

- COIs are stored in the private `contractor-coi-pdfs` bucket, uploaded service-role
  only, and read exclusively through short-lived signed URLs.
- RLS: contractors read only their own rows; only admins update or decide.
- MIME allow-list (PDF/JPEG/PNG/HEIC/HEIF/WebP) and an 8 MB cap on uploads.
- Uploading a certificate never sets `verified`.
- No provider secrets in frontend code; only public URLs reach the browser.
- Internal admin notes and waiver reasons are never shown to contractors.

## EXTERNAL CONFIGURATION REQUIRED — Thimble

Partnership: https://www.thimble.com/partner · Certificate Manager:
https://www.thimble.com/certificate-manager

Nothing about Thimble is fabricated. The `thimble` row in
`public.insurance_providers` is seeded **disabled**. Once Tidy receives official
partnership configuration, set on that row (admin UI or SQL):

| Field | Value to insert |
| --- | --- |
| `enabled` | `true` |
| `integration_type` | `iframe_embed` (only if Thimble authorises embedding) or `referral_link` |
| `embed_url` | official Thimble embed URL (includes partner/affiliate params) |
| `referral_url` | official Thimble referral destination |
| `embed_supported` | `true` only when embedding is authorised |

Optional edge-function environment overrides used only when those columns are blank:
`THIMBLE_EMBED_URL`, `THIMBLE_REFERRAL_URL`. Any partner/affiliate identifier or
token that must stay private belongs in edge-function secrets
(`THIMBLE_PARTNER_ID`, `THIMBLE_AFFILIATE_ID`) — never in frontend code.

Until then the "Get Covered" CTA renders disabled ("coming soon") and applicants are
routed to the "Use Existing Insurance" path — no dead links, nobody stranded.

Thimble Certificate Manager exposes no public API today, so Tidy's own database
remains the authoritative record of whether a contractor may accept a job;
Certificate Manager can be used operationally alongside it.
