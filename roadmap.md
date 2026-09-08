# Phase 3 — make the pay correct

- [ ] 1. Drop pro_visit_pay_cents (check callers first)
- [ ] 2. addon-request-respond: derive pro share from canon (40% + Tier 2 +10% rounded)
- [ ] 3. Tier uplift resolved at assignment; base frozen at creation
- [ ] 4. Generate + pay Shine full details (2/yr) and weekly deep clean (quarterly) via visit_kind
- [ ] 5. PAY_IN_FULL_WHEN_BLOCKED with required paid_in_full_reason
- [ ] 6. referral-bonus-check: auth, idempotency key, status guard, no paid-without-transfer; pro_bonuses blocked recovery
- [ ] Prove with rows, clean up test data

Rules: no send-documenso-envelope, no customer price changes, no publish.
