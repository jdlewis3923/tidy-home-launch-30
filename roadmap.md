# Roadmap

## In progress (server-authoritative pass)
- [ ] 1. Car service: wash vs detail as mutually exclusive variants (service_code, duration_minutes, arrival_window_minutes), per-variant scheduling, "Done by ~" finish estimate, server rejection of both.
- [ ] 2. Car service: "Before we come out" water/outlet/HOA gate — 3 required checkboxes, stored on order, surfaced on Jobber job, soft-fail to lead capture.
- [ ] 3. Preferred Pro: dropdown on service detail, preferred_pro_id, capacity signal + "high demand" label, fallback scheduling with SMS on substitution, preferred_by_count in admin.
- [ ] 4. /rate rebuild: ungated Google review button for every star value, low-rating make-it-right panel below it, Brevo ops alert, visit_rating dataLayer event.
- [ ] 5. Reviews -> Pro bonus: reviews + pro_bonuses tables, CSV/paste ingestion adapter, attribution scoring, /admin/reviews, weekly cron digest, Stripe Connect separate transfer with idempotency, Pro-facing cap progress.

## Cross-cutting
- [ ] dataLayer events: car_variant_select, access_gate_fail, preferred_pro_set, visit_rating.
- [ ] EN/ES parity for all new copy.
