/**
 * PRICING CANON — the ONE source of truth for every price and discount.
 *
 * Every page, component, edge function, and Stripe catalog row must trace back
 * to these numbers. Do not hardcode a price or a discount percentage anywhere
 * else. The mirror used by edge functions lives at
 * `supabase/functions/_shared/pricing-canon.ts` and
 * `src/test/pricing-canon.test.ts` fails if the two ever diverge, if the Stripe
 * catalog in the database disagrees, or if a page ships a stale number.
 */

export type CanonService = 'cleaning' | 'lawn' | 'detailing';
export type CanonFrequency = 'monthly' | 'biweekly' | 'weekly';

/** Recurring monthly plan price in whole dollars. `null` = tier not offered. */
export const SERVICE_PRICES: Record<CanonService, Record<CanonFrequency, number | null>> = {
  cleaning: { monthly: 159, biweekly: 275, weekly: 459 },
  lawn: { monthly: 85, biweekly: 129, weekly: 195 },
  detailing: { monthly: 159, biweekly: 249, weekly: null },
};

/** Extra Large per-visit upcharge, in whole dollars. */
export const XL_UPCHARGE_CANON: Record<CanonService, number> = {
  cleaning: 60,
  lawn: 30,
  detailing: 30, // per vehicle
};

/**
 * Bundle discount by count of DISTINCT services, as a percentage.
 * Mirrored in `public.bundle_discount_tiers` (the row the charge reads) and in
 * the Stripe coupons TIDY_BUNDLE_10PCT / TIDY_BUNDLE_15PCT.
 */
export const BUNDLE_DISCOUNT_PCT_CANON: Record<number, number> = { 2: 10, 3: 15 };

/** Referral program — give $50, get $50. */
export const REFERRAL_BONUS_CENTS = 5000;

/** Highest bundle rate any cart can reach — what catalog rows are flagged at. */
export const TOP_BUNDLE_DISCOUNT_PCT = Math.max(...Object.values(BUNDLE_DISCOUNT_PCT_CANON));

/** Price in cents, for Stripe comparisons. */
export function priceCents(service: CanonService, frequency: CanonFrequency): number | null {
  const dollars = SERVICE_PRICES[service][frequency];
  return dollars == null ? null : Math.round(dollars * 100);
}

/** Discount percentage for a distinct-service count (highest tier reached). */
export function canonBundlePct(serviceCount: number): number {
  let pct = 0;
  for (const [count, value] of Object.entries(BUNDLE_DISCOUNT_PCT_CANON)) {
    if (serviceCount >= Number(count) && value > pct) pct = value;
  }
  return pct;
}
