# Roadmap

## Server-authoritative pass — complete
- [x] 1. Car service: wash vs detail as mutually exclusive variants (service_code, duration_minutes, arrival_window_minutes), per-variant scheduling with contiguous-block starts, "Done by ~" finish estimate, server rejection of both.
- [x] 2. Car service: "Before we come out" water/outlet/HOA gate — 3 required checkboxes, stored on the subscription, surfaced on the Jobber job, soft-fail to lead capture.
- [x] 3. Preferred Pro: dropdown on the service detail page, preferred_pro_id, capacity signal + "high demand" label, fallback scheduling with SMS on substitution, preferred_by_count in admin.
- [x] 4. /rate rebuild: ungated Google review button for every star value, low-rating make-it-right panel below it, Brevo ops alert, visit_rating dataLayer event.
- [x] 5. Reviews -> Pro bonus: reviews + pro_bonuses tables, paste/CSV ingestion adapter, attribution scoring, /admin/reviews + /admin/reviews/import, "Reviews this week" admin card, Monday 12:00 UTC digest cron, Stripe Connect separate transfer with idempotency, Pro-facing cap progress at /pro/review-bonus.

## Cross-cutting
- [x] dataLayer events: car_variant_select, access_gate_fail, preferred_pro_set, visit_rating.
- [x] EN/ES parity for all new copy.

## Follow-ups (not requested yet)
- Ingestion adapter B (Google Business Profile API) once API access is approved — adapter interface is already in place.
