# Pricing rebuild — three sizes, lookup keys, gift bundle

The four-band (Compact/Standard/Large/Estate) work is abandoned and reverted. New model: sizes 1/2/3 on every service, Stripe referenced only by `lookup_key`, cadence carried by quantity, bundle is free car washes rather than a percentage.

## 1. Verify Stripe before writing anything
Resolve all 15 recurring lookup keys against live Stripe (`clean_1..3`, `lawn_1..3`, `shine_1..3`, `wash_{1,2,3}_x{1,2}`) plus the 15 one-time add-ons, and confirm amounts match this brief. If a key is missing or archived, stop and report it rather than guessing a price ID.

## 2. Revert the four-band code
Delete the band model from `src/lib/pricing-canon.ts`, `supabase/functions/_shared/pricing-canon.ts`, `src/lib/dashboard-pricing.ts`, `src/lib/checkout.ts`, the four-band tests, and the band UI in `StepProperty.tsx`. Drop the four-band catalog rows and the `band`/`band_reviews` migration objects (mark rows inactive, do not delete history).

## 3. New single source of truth
One canon file, mirrored server-side (parity test enforces byte equality of values):
- sizes 1/2/3 per service with label, price, unit (`per_visit` / `per_month`), lookup key, quantity rule (`cadence` / `always_1`)
- cadence multipliers monthly 1 / biweekly 2 / weekly 4
- entry price "from $90/mo" (lawn size 1, biweekly)
- sizing rules: bedrooms for cleaning (extra baths move up one size, 5+ bedrooms not purchasable), turf bands for lawn (over 10,000 sq ft not purchasable), vehicle class for car care
- bundle gift: 2nd service = 1 free monthly car wash, 3rd = 2
- no percentages, no XL surcharge, no promo codes

## 4. Supabase
- `stripe_catalog`: exactly the 15 recurring + 15 one-time rows active, all others set inactive; columns `lookup_key`, `size`, `service`, `unit`, `quantity_rule`
- `subscriptions`: add `size`, plus founding-offer fulfilment columns (`founding_rate_locked`, `free_addon_first_visit`, `founding_zip_slot`) written at signup
- keep RLS/grants pattern already used by these tables

## 5. Checkout and edge functions
`stripe-create-checkout` and `create-stripe-payment-intent` resolve prices by lookup key from the catalog, set quantity from the cadence rule (always 1 for Shine and Car Wash Add-On), block non-purchasable sizes with a quote path, attach the free-car-wash gift line at $0 or as a fulfilment flag, and write founding-offer promises onto the subscription row. Remove all coupon/bundle-percentage code and the dead founding coupons. A test fails if displayed total ≠ Stripe session amount.

## 6. Sizing UX
Three plain pickers: bedrooms/baths, lawn by eye with the satellite-confirmation note verbatim, vehicle type. No square-footage or turf inputs at checkout. Live size name + price as they pick. 5+ bedroom and >10,000 sq ft paths show "Call for a quote", no checkout button. ZIP outside 33156/33183/33186 → waitlist, never checkout.

## 7. Copy sweep
Remove every occurrence of: Compact/Standard/Large/Estate as customer labels; prices $85 $105 $110 $119 $129 $135 $159 $169 $195 $209 $219 $249 $275 $299 $459 and add-on $79 $109 $159; "from $85/mo", "from $110/mo", "from $129/mo"; all percentage discounts; XL Size Upgrade; every star rating, review count and testimonial; "South Florida"/broad Miami claims; "$50 off your first month", NEIGHBOR50, TIDY50 and any promo-code field. Rename "Driveway Add-On" → "Car Wash Add-On" everywhere, keeping the separate one-time "Driveway Pressure Wash" ($150).

Files in scope: `PricingTable.tsx`, `Services.tsx`, `Hero.tsx`, `AnnouncementTicker.tsx`, `TrustBar.tsx`, `Bundle.tsx`, `HouseCleaning.tsx`, `LawnCare.tsx`, `CarDetailing.tsx`, landing components (`SeoHead`, `ServiceLandingPage`, `StickyBookBar`, `SavingsCallout`), `FAQ.tsx`, `LeadPopup.tsx`, `Index.tsx`, `Refer.tsx`, `Terms.tsx`, `DashboardIndex.tsx`, `Billing.tsx`, dashboard steps, `LanguageContext.tsx` (47 stale price strings, EN + ES).

## 8. Trust claims
Exactly: Background-Checked Pros | Photo-Verified Every Visit | Cancel Anytime | Same Pro Every Time | Serving Kendall & Pinecrest. "Insured" stays off behind a single clearly-marked flag constant so it can be switched on in one edit. Service area line everywhere: "Serving Pinecrest, Kendall & Palmetto Bay — 33156, 33183, 33186".

## 9. Publish sizing rules and inclusions
"How sizing works" section on the pricing page, mirrored in the FAQ with the six Q/A entries verbatim. Publish the cleaning / lawn / Shine Complete inclusion lists, with the cleaning exclusions explicitly marked as paid add-ons.

## 10. /neighbor landing page
New route carrying the founding offer (rate lock, free premium add-on, first visit perfect or free, capped at 25 homes per ZIP, in exchange for a review after visit two), accepting and persisting UTM parameters into the signup payload.

## 11. Also update
Chatbot knowledge base pricing answers, JSON-LD offers, meta/OG text containing prices, every seeded/fallback price constant, and the dashboard plan display so a customer sees their size and what it means.

## 12. Verify
Typecheck, run the full test suite (canon parity, checkout-vs-Stripe total, purchasable-size guards), grep for every deleted price string and dead phrase, then report the file list and removed strings. `site_live` stays false; the $50 referral and $50 5★ contractor bonus are untouched.
