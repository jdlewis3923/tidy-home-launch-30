---
name: Pro kit standard and vehicle magnets
description: Per-service Pro kit contents, optional vehicle magnets with $15/month credit, and the automatic kit order flow
type: feature
---

Kit Tidy provides at no cost to the Pro (never phrased as a requirement — Pros are 1099 contractors, "Tidy provides, you choose"):
- House cleaning: 2 embroidered polos + photo ID badge. No vest (it was a lawn road-safety item).
- Lawn care: 2 tees + 2 hi-vis vests + photo ID badge.
- Car care: 2 tees + photo ID badge.

Vehicle magnets: offered on all three services, always opt-in. The Pro tests the driver's door with a household magnet first (aluminium/composite will not hold; nothing is ever taped or adhered). Opting in earns a $15/month vehicle advertising credit paid with the Friday deposit under a short bilingual vehicle advertising agreement signed in the intake form. Opting out changes nothing else.

Sources of truth: `src/lib/proKit.ts` (mirrored byte-identical in `supabase/functions/_shared/pro-kit.ts`, enforced by `src/test/pro-kit-parity.test.ts`) and `src/lib/vehicleAdAgreement.ts`.

Automatic flow: `/intake/:token` submission → `intake-submitted` builds `pro_kit.kit_summary` (paste-ready vendor order), emails hello@jointidy.co and one confirmation to the Pro with the `/badge/:token` photo upload link. No manual message step. Badge photos land in the private `pro-badge-photos` bucket (admin read only).

Legal review of the vehicle advertising agreement and the ICA is tracked in `legal_review_items` and shown on /admin/documents; due before the 10th signed Pro.
