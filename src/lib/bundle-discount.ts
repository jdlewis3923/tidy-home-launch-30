/**
 * Bundle discount rates — SINGLE SOURCE OF TRUTH for the client.
 *
 * These percentages must stay identical to the rates the server actually
 * charges (FALLBACK_BUNDLE_DISCOUNTS in supabase/functions/stripe-create-checkout,
 * mirrored in app_settings.bundle_discount_pct and the Stripe coupons
 * TIDY_BUNDLE_10PCT / TIDY_BUNDLE_15PCT).
 *
 * src/test/checkout-stripe-parity.test.ts fails if this map ever drifts from
 * the server, or if the displayed total stops matching the Stripe session
 * amount. Do not hardcode a rate anywhere else.
 */
export const BUNDLE_DISCOUNT_PCT: Record<number, number> = { 2: 10, 3: 15 };

/** Discount as a 0–1 fraction for the given count of distinct services. */
export function getBundleDiscountPct(serviceCount: number): number {
  if (serviceCount >= 3) return BUNDLE_DISCOUNT_PCT[3];
  if (serviceCount === 2) return BUNDLE_DISCOUNT_PCT[2];
  return 0;
}
