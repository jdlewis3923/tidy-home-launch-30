---
name: Pricing canon
description: Single source of truth for all prices, bundle discounts, and the referral bonus
type: feature
---
All prices and discounts come from `src/lib/pricing-canon.ts`, mirrored for edge
functions at `supabase/functions/_shared/pricing-canon.ts`. Never hardcode a
price or percentage anywhere else.

- Three sizes (1/2/3) per service, no square footage tiers beyond the surcharge bands.
- Volume curve: monthly is the reference, biweekly x0.92, weekly x0.82. Always billed monthly.
- House Cleaning per visit: $139/$128/$114 · $189/$174/$155 · $279/$257/$229
  Billed monthly: 139/256/456 · 189/348/620 · 279/514/916
- Lawn Care per visit: $45/$41/$37 · $65/$60/$53 · $99/$91/$81
  Billed monthly: 45/82/148 · 65/120/212 · 99/182/324
  The $55/$75/$109 lawn figures were WITHDRAWN — $55 must never appear as a lawn price.
  Headline lawn copy is "from $45 a month".
- Shine Complete per month: $149 / $179 / $239 (3 maintenance washes + 2 full details a year)
- Surcharges are per visit, attached as their own Stripe line with
  quantity = visits_per_month: cleaning XL 6000 (`surcharge_cleaning_xl`),
  lawn XL 3000 (`surcharge_lawn_xl`). Never separate cadence variants.
- Contractor pay = 40% of the visit price, never customer-visible.
  Lawn pay: $18/$16/$15 · $26/$24/$21 · $40/$36/$32. Tier 2 +10%, rounded.

- Bundling is NEVER a discount and NEVER a car wash. It is ONE free premium
  add-on per month whenever the customer holds 2+ distinct services. The
  CUSTOMER CHOOSES the add-on (`freeAddonsPerMonth`, `FREE_ADDON_CUSTOMER_CHOICE`,
  pool = `GIFT_ELIGIBLE_ADDONS`, which excludes specialist work such as Driveway
  Pressure Wash).
- Referral: give $50 / get $50 (5000 cents)
- Florida sales tax is NOT collected: `FL_SALES_TAX_COLLECTION_ENABLED = false`
  in `supabase/functions/_shared/florida-tax.ts` plus `app_settings.fl_sales_tax_enabled`.

One-time add-on catalog (Stripe one-time prices, 15 total): interior windows $55,
oven $45, fridge $35, baseboards $35, cabinets $50, pet hair $45, exterior
windows + screens $85, bed edge reset $65, weed removal $45, leaf & debris $55,
hedge trim $65, driveway pressure wash $150, clay bar & ceramic $95, headlight
restoration $79, interior protect & condition $55.

Guards: `src/test/pricing-canon.test.ts` and
`src/test/checkout-stripe-parity.test.ts` fail on any drift between canon,
client display, Stripe catalog, DB tiers, and the charged amount.
