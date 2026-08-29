/**
 * PRICING CANON — the ONE source of truth for every price and discount.
 *
 * The model: one flat price per visit, set by the size band of the property.
 * Cadence multiplies it (monthly x1, biweekly x2, weekly x4). The only
 * discount is the bundle discount. There is no frequency discount and no
 * size "upgrade" surcharge — the band IS the price.
 *
 * The client copy lives at
 * `src/lib/pricing-canon.ts`; `src/test/pricing-canon.test.ts`
 * fails if the two diverge, if the Stripe catalog disagrees, or if a page ships
 * a stale number.
 */

export type CanonService = "cleaning" | "lawn" | "detailing";
export type CanonBand = "compact" | "standard" | "large" | "estate";
export type CanonCadence = "monthly" | "biweekly" | "weekly";

export const BANDS: CanonBand[] = ["compact", "standard", "large", "estate"];

/** Per-visit price in whole dollars, by service and band. */
export const BAND_PRICES: Record<CanonService, Record<CanonBand, number>> = {
  cleaning: { compact: 119, standard: 149, large: 219, estate: 299 },
  lawn: { compact: 55, standard: 69, large: 105, estate: 135 },
  detailing: { compact: 119, standard: 139, large: 179, estate: 219 },
};

/** Visits billed per month for each cadence. */
export const CADENCE_MULTIPLIER: Record<CanonCadence, number> = {
  monthly: 1,
  biweekly: 2,
  weekly: 4,
};

/** Live Stripe products — cadence-agnostic, one per service. */
export const STRIPE_PRODUCT_IDS: Record<CanonService, string> = {
  cleaning: "prod_V9xQs6lixEmaXs",
  lawn: "prod_V9xQtvYJFErOag",
  detailing: "prod_V9xQ8RCRFTdLBK",
};

/** Live per-visit Stripe prices. Cadence is set with `quantity`, not price. */
export const STRIPE_PRICE_IDS: Record<CanonService, Record<CanonBand, string>> = {
  cleaning: {
    compact: "price_1U9dWND7AxvAjJGvikkpM5oo",
    standard: "price_1U9dWdD7AxvAjJGv0476nn3e",
    large: "price_1U9dWiD7AxvAjJGvXpIZJ367",
    estate: "price_1U9dWmD7AxvAjJGvbSwUpNZu",
  },
  lawn: {
    compact: "price_1U9dWrD7AxvAjJGv0d6VTUcs",
    standard: "price_1U9dWvD7AxvAjJGvaCMrL4Jp",
    large: "price_1U9dWzD7AxvAjJGv58uQlPNP",
    estate: "price_1U9dXCD7AxvAjJGveTN1h0Rg",
  },
  detailing: {
    compact: "price_1U9dXGD7AxvAjJGv2bx2MHGJ",
    standard: "price_1U9dXKD7AxvAjJGvGVpD41QG",
    large: "price_1U9dXPD7AxvAjJGvJmXLFvts",
    estate: "price_1U9dXTD7AxvAjJGvx6gFOj2X",
  },
};

/**
 * Bundle discount by count of DISTINCT services, as a percentage. It is a
 * property of the ORDER, never of a catalog row — computed server-side in
 * stripe-create-checkout from the cart, and mirrored by the Stripe coupons
 * TIDY_BUNDLE_10PCT / TIDY_BUNDLE_15PCT.
 */
export const BUNDLE_DISCOUNT_PCT_CANON: Record<number, number> = { 2: 10, 3: 15 };

/** Referral program — give $50, get $50. */
export const REFERRAL_BONUS_CENTS = 5000;

/** The advertised band. Headline prices always quote this one. */
export const HEADLINE_BAND: CanonBand = "standard";

/** Single company-wide "from" price: a Standard lawn visit. */
export const FROM_PRICE_PER_VISIT = BAND_PRICES.lawn.standard;

/**
 * Contractor pay — a share of BANDED LIST price with a per-visit floor.
 * The bundle discount comes out of Tidy's margin, never contractor pay.
 */
export const CONTRACTOR_PAY = {
  tier1: { pct: 45, floorDollars: 30 },
  tier2: { pct: 50, floorDollars: 35 },
} as const;

/** Per-visit price in whole dollars. */
export function bandPrice(service: CanonService, band: CanonBand): number {
  return BAND_PRICES[service][band];
}

/** Per-visit price in cents, for Stripe comparisons. */
export function bandPriceCents(service: CanonService, band: CanonBand): number {
  return Math.round(bandPrice(service, band) * 100);
}

/** Monthly billed amount for one service line: per-visit price x cadence. */
export function linePrice(service: CanonService, band: CanonBand, cadence: CanonCadence, qty = 1): number {
  return bandPrice(service, band) * CADENCE_MULTIPLIER[cadence] * qty;
}

/** Discount percentage for a distinct-service count (highest tier reached). */
export function canonBundlePct(serviceCount: number): number {
  let pct = 0;
  for (const [count, value] of Object.entries(BUNDLE_DISCOUNT_PCT_CANON)) {
    if (serviceCount >= Number(count) && value > pct) pct = value;
  }
  return pct;
}

/** Contractor pay for one visit at banded list price, by tier. */
export function contractorPayForVisit(listDollars: number, tier: 1 | 2): number {
  const rule = tier === 2 ? CONTRACTOR_PAY.tier2 : CONTRACTOR_PAY.tier1;
  return Math.max((listDollars * rule.pct) / 100, rule.floorDollars);
}

// ---------------------------------------------------------------------------
// Band definitions. Customers never enter square footage — we infer the band
// from plain-language answers. Square footage is a tiebreak we only apply when
// we already know it (county record, contractor visit).
// ---------------------------------------------------------------------------

/** Cleaning: bed/bath, with square footage as tiebreak. */
export function bandFromBedBath(bedrooms: number, bathrooms: number): CanonBand {
  const beds = Math.max(1, bedrooms);
  const baths = Math.max(1, Math.ceil(bathrooms));
  if (beds >= 5 || baths >= 4) return "estate";
  if (beds >= 4 || baths >= 3) return "large";
  if (beds >= 3) return "standard";
  return "compact";
}

/** Cleaning square-footage tiebreak — square footage wins when they disagree. */
export function bandFromHomeSqFt(sqft: number): CanonBand | null {
  if (sqft <= 1400) return "compact";
  if (sqft <= 2200) return "standard";
  if (sqft <= 3200) return "large";
  if (sqft <= 4500) return "estate";
  return null; // above Estate — custom quote, never auto-booked
}

/** Lawn: total lot size. Band on the parcel, service the yard. */
export function bandFromLotSqFt(sqft: number): CanonBand | null {
  if (sqft < 10890) return "compact";
  if (sqft <= 21780) return "standard";
  if (sqft <= 32670) return "large";
  if (sqft <= 43560) return "estate";
  return null; // over an acre — custom quote
}

/** Corner lots move up one band. */
export function bumpBand(band: CanonBand): CanonBand | null {
  const i = BANDS.indexOf(band);
  return i < BANDS.length - 1 ? BANDS[i + 1] : null;
}

export type VehicleClass =
  | "coupe"
  | "sedan"
  | "hatchback"
  | "crossover"
  | "suv2row"
  | "suv3row"
  | "pickup"
  | "minivan"
  | "suvFullSize"
  | "dually"
  | "eightSeat";

export const VEHICLE_CLASS_BAND: Record<VehicleClass, CanonBand> = {
  coupe: "compact",
  sedan: "compact",
  hatchback: "compact",
  crossover: "standard",
  suv2row: "standard",
  suv3row: "large",
  pickup: "large",
  minivan: "large",
  suvFullSize: "estate",
  dually: "estate",
  eightSeat: "estate",
};
