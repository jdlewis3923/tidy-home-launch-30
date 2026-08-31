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
- Bundling is NEVER a discount and NEVER a car wash. It is ONE free premium
  add-on per month whenever the customer holds 2+ distinct services. No
  3-service tier. The CUSTOMER CHOOSES the add-on (`freeAddonsPerMonth`,
  `FREE_ADDON_CUSTOMER_CHOICE`, pool = `GIFT_ELIGIBLE_ADDONS`, which excludes
  specialist work such as Driveway Pressure Wash).
  Why no free wash: the only wash in the system is the $0.00 Maintenance Wash
  scheduling row inside Shine Complete, never billed separately, so no system
  (Stripe or Jobber) can fulfil a free car wash.
- Referral: give $50 / get $50 (5000 cents)
- Florida sales tax is NOT collected: `FL_SALES_TAX_COLLECTION_ENABLED = false`
  in `supabase/functions/_shared/florida-tax.ts` plus `app_settings.fl_sales_tax_enabled`.
  Both must flip together; displayed tax must equal charged tax.

Guards: `src/test/pricing-canon.test.ts` and
`src/test/checkout-stripe-parity.test.ts` fail on any drift between canon,
client display, Stripe catalog, DB tiers, and the charged amount.
