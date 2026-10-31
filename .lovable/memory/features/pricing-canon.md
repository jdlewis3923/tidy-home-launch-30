---
name: Pricing canon
description: Single source of truth for all prices, bundle gifts, Deep Clean and the referral bonus
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
  Lawn pay is flat across cadence: $18 / $26 / $40 (Small/Standard/Large). Cleaning flat: $56/$76/$112/$170/$238; first Estate/Estate Plus visit 1.5x ($255/$357). Tier 2 +10%, rounded. (Older $16/$15 cadence pay is WRONG.)

- Bundling is NEVER a discount and NEVER a car wash. It is ONE free premium
  add-on per month whenever the customer holds 2+ distinct services. The
  CUSTOMER CHOOSES the add-on (`freeAddonsPerMonth`, `FREE_ADDON_CUSTOMER_CHOICE`,
  pool = `GIFT_ELIGIBLE_ADDONS`, which excludes specialist work such as Driveway
  Pressure Wash).
- Referral: give $50 / get $50 (5000 cents)
- Florida sales tax is NOT collected: `FL_SALES_TAX_COLLECTION_ENABLED = false`
  in `supabase/functions/_shared/florida-tax.ts` plus `app_settings.fl_sales_tax_enabled`.

Add-ons: the live catalog (addon_catalog / src/lib/addon-catalog.ts) is the only source; hedge trim, pressure wash, headlight, baseboards and cabinets as standalone add-ons are retired. Pro gets 40% of every add-on.
Deep Clean add-on (members only, never a gift): $149/$179/$219/$289/$389 by cleaning size, Pro pay 40%. Weekly plans include a quarterly deep clean every 13th week. Cleaning is sized by sq ft (≤1,400 / 1,400–2,200 / 2,200–3,200 / Estate 3,200–4,800 / Estate Plus 4,800–7,000; >7,000 walkthrough). Bundling is a monthly gift add-on, never a discount.

Guards: `src/test/pricing-canon.test.ts` and
`src/test/checkout-stripe-parity.test.ts` fail on any drift between canon,
client display, Stripe catalog, DB tiers, and the charged amount.

Car care pay (locked 21 Sep 2026): maintenance wash $16/$20/$26, full detail $78/$88/$115
(sedan-coupe / SUV-crossover / truck-3row-van). $17/$27/$51/$61/$82 were WRONG — never use.
Car Wash Add-On pay: x1 16/20/26, x2 32/40/52.
Stripe metadata (live AND test must mirror): plans carry contractor_pay_per_visit,
budget_hours_per_visit (clean 2.20/3.10/4.45, lawn 0.60/0.95/1.50), visits_per_month (1/2/4);
shine_N carries wash_pay, washes_per_month 3, detail_pay, details_per_year 2;
wash and add-on prices carry contractor_pay in dollars.
