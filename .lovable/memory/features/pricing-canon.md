---
name: Pricing canon
description: Single source of truth for all prices, bundle discounts, and the referral bonus
type: feature
---
All prices and discounts come from `src/lib/pricing-canon.ts`, mirrored for edge
functions at `supabase/functions/_shared/pricing-canon.ts`. Never hardcode a
price or percentage anywhere else.

- House Cleaning: $159 monthly / $275 biweekly / $459 weekly
- Lawn Care: $85 / $129 / $195
- Car Detailing: $159 monthly / $249 biweekly (no weekly)
- XL upcharge: cleaning +$60, lawn +$30, detailing +$30 per vehicle
- Bundle discount: 10% for 2 distinct services, 15% for 3 (Stripe coupons
  TIDY_BUNDLE_10PCT / TIDY_BUNDLE_15PCT, DB table `bundle_discount_tiers`)
- Referral: give $50 / get $50 (5000 cents)
- Florida sales tax is NOT collected: `FL_SALES_TAX_COLLECTION_ENABLED = false`
  in `supabase/functions/_shared/florida-tax.ts` plus `app_settings.fl_sales_tax_enabled`.
  Both must flip together; displayed tax must equal charged tax.

Guards: `src/test/pricing-canon.test.ts` and
`src/test/checkout-stripe-parity.test.ts` fail on any drift between canon,
client display, Stripe catalog, DB tiers, and the charged amount.
