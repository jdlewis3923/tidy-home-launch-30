// PRICING CANON (server mirror).
//
// This file MUST stay byte-identical in values to src/lib/pricing-canon.ts.
// src/test/pricing-canon.test.ts parses both and fails on any divergence.

export type CanonService = "cleaning" | "lawn" | "detailing";
export type CanonFrequency = "monthly" | "biweekly" | "weekly";

/** Recurring monthly plan price in whole dollars. null = tier not offered. */
export const SERVICE_PRICES: Record<CanonService, Record<CanonFrequency, number | null>> = {
  cleaning: { monthly: 159, biweekly: 275, weekly: 459 },
  lawn: { monthly: 85, biweekly: 129, weekly: 195 },
  detailing: { monthly: 159, biweekly: 249, weekly: null },
};

/** Extra Large per-visit upcharge, in whole dollars. */
export const XL_UPCHARGE_CANON: Record<CanonService, number> = {
  cleaning: 60,
  lawn: 30,
  detailing: 30,
};

/** Bundle discount by count of DISTINCT services, as a percentage. */
export const BUNDLE_DISCOUNT_PCT_CANON: Record<number, number> = { 2: 10, 3: 15 };

/** Referral program — give $50, get $50. */
export const REFERRAL_BONUS_CENTS = 5000;

/** Highest bundle rate any cart can reach. */
export const TOP_BUNDLE_DISCOUNT_PCT = Math.max(...Object.values(BUNDLE_DISCOUNT_PCT_CANON));

export function priceCents(service: CanonService, frequency: CanonFrequency): number | null {
  const dollars = SERVICE_PRICES[service][frequency];
  return dollars == null ? null : Math.round(dollars * 100);
}

export function canonBundlePct(serviceCount: number): number {
  let pct = 0;
  for (const [count, value] of Object.entries(BUNDLE_DISCOUNT_PCT_CANON)) {
    if (serviceCount >= Number(count) && value > pct) pct = value;
  }
  return pct;
}
