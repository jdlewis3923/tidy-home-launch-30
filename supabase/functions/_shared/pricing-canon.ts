// PRICING CANON (server mirror).
//
// This file MUST stay identical in values to src/lib/pricing-canon.ts.
// src/test/pricing-canon.test.ts parses both and fails on any divergence.
export type CanonService = 'cleaning' | 'lawn' | 'detailing';
export type CanonSize = 1 | 2 | 3;
/** `quote` is not a size — it means the property is above size 3 and must never be auto-booked. */
export type SizeSelection = CanonSize | 'quote';
export type CanonCadence = 'monthly' | 'biweekly' | 'weekly';
export type PriceUnit = 'per_visit' | 'per_month';
export type QuantityRule = 'cadence' | 'always_1';

export const SIZES: CanonSize[] = [1, 2, 3];

/** Price in whole dollars, by service and size. Unit differs per service. */
export const SIZE_PRICES: Record<CanonService, Record<CanonSize, number>> = {
  cleaning: { 1: 139, 2: 189, 3: 279 },
  lawn: { 1: 45, 2: 65, 3: 99 },
  detailing: { 1: 149, 2: 179, 3: 239 },
};

/** Stripe lookup keys for the recurring service prices. */
export const SERVICE_LOOKUP_KEYS: Record<CanonService, Record<CanonSize, string>> = {
  cleaning: { 1: 'clean_1', 2: 'clean_2', 3: 'clean_3' },
  lawn: { 1: 'lawn_1', 2: 'lawn_2', 3: 'lawn_3' },
  detailing: { 1: 'shine_1', 2: 'shine_2', 3: 'shine_3' },
};

export const SERVICE_UNIT: Record<CanonService, PriceUnit> = {
  cleaning: 'per_visit',
  lawn: 'per_visit',
  detailing: 'per_month',
};

export const SERVICE_QUANTITY_RULE: Record<CanonService, QuantityRule> = {
  cleaning: 'cadence',
  lawn: 'cadence',
  detailing: 'always_1',
};

/** Customer-facing service names. */
export const SERVICE_NAMES: Record<CanonService, string> = {
  cleaning: 'House Cleaning',
  lawn: 'Lawn Care',
  detailing: 'Shine Complete',
};

/** Size labels, per service, in the customer's own words. */
export const SIZE_LABELS: Record<CanonService, Record<CanonSize, string>> = {
  cleaning: {
    1: 'Condo / up to 2 bedrooms',
    2: 'House / 3 bedrooms',
    3: 'Large house / 4 bedrooms',
  },
  lawn: {
    1: 'Small yard',
    2: 'Standard yard',
    3: 'Large yard',
  },
  detailing: {
    1: 'Sedan / coupe',
    2: 'SUV / crossover',
    3: 'Truck / 3-row SUV / van',
  },
};

/** The detail under each size label. */
export const SIZE_HELPERS: Record<CanonService, Record<CanonSize, string>> = {
  cleaning: {
    1: 'max 2 baths',
    2: 'max 2.5 baths',
    3: 'max 3 baths',
  },
  lawn: {
    1: 'up to 3,000 sq ft of turf',
    2: '3,001–6,000 sq ft of turf',
    3: '6,001–10,000 sq ft of turf',
  },
  detailing: {
    1: 'coupe, sedan',
    2: 'SUV, crossover',
    3: 'truck, 3-row SUV, van',
  },
};

/** Visits billed per month for each cadence. Per-visit services only. */
export const CADENCE_MULTIPLIER: Record<CanonCadence, number> = {
  monthly: 1,
  biweekly: 2,
  weekly: 4,
};

// ---------------------------------------------------------------------------
// Car Wash Add-On — per month, requires an active lawn or cleaning plan.
// Renamed from "Driveway Add-On". Not to be confused with the one-time lawn
// add-on "Driveway Pressure Wash", which cleans concrete.
// ---------------------------------------------------------------------------

export const CAR_WASH_ADDON_NAME = 'Car Wash Add-On';

export type WashCount = 1 | 2;

export const CAR_WASH_PRICES: Record<CanonSize, Record<WashCount, number>> = {
  1: { 1: 39, 2: 75 },
  2: { 1: 49, 2: 95 },
  3: { 1: 65, 2: 129 },
};

export const CAR_WASH_LOOKUP_KEYS: Record<CanonSize, Record<WashCount, string>> = {
  1: { 1: 'wash_1_x1', 2: 'wash_1_x2' },
  2: { 1: 'wash_2_x1', 2: 'wash_2_x2' },
  3: { 1: 'wash_3_x1', 2: 'wash_3_x2' },
};

export const CAR_WASH_UNIT: PriceUnit = 'per_month';
export const CAR_WASH_QUANTITY_RULE: QuantityRule = 'always_1';

// ---------------------------------------------------------------------------
// The bundle is a gift, not a discount. No percentages anywhere.
//
// The gift is ONE free premium add-on per month whenever the customer holds two
// or more distinct services. There is no three-service tier and there is NO
// free car wash: the only wash in the whole system is the $0.00 Maintenance
// Wash scheduling row inside a Shine Complete subscription, which is never
// billed separately, so a free car wash cannot be fulfilled by Stripe or
// Jobber. The gift pool is the standard add-on catalogue minus specialist work
// (see GIFT_ELIGIBLE_ADDONS in src/lib/addon-catalog.ts — Driveway Pressure
// Wash is excluded). The CUSTOMER CHOOSES which add-on they take each month;
// we never assign one.
// ---------------------------------------------------------------------------

/** Free premium add-ons each month, by count of DISTINCT services in the plan. */
export function freeAddonsPerMonth(serviceCount: number): number {
  return serviceCount >= 2 ? 1 : 0;
}

/** True when the plan earns the monthly free add-on. */
export function hasFreeAddonEntitlement(serviceCount: number): boolean {
  return freeAddonsPerMonth(serviceCount) > 0;
}

/** The customer picks the add-on; it is never assigned for them. */
export const FREE_ADDON_CUSTOMER_CHOICE = true;

export const BUNDLE_GIFT_COPY = {
  two: 'Add a 2nd service — you pick one free premium add-on every month.',
} as const;


// ---------------------------------------------------------------------------
// Entry price and referral
// ---------------------------------------------------------------------------

/** The single company-wide entry price: lawn size 1, biweekly. */
export const ENTRY_PRICE_MONTHLY = SIZE_PRICES.lawn[1] * CADENCE_MULTIPLIER.biweekly;
export const ENTRY_PRICE_COPY = `from $${ENTRY_PRICE_MONTHLY}/mo`;

/** Referral program — give $50, get $50. Unchanged. */
export const REFERRAL_BONUS_CENTS = 5000;

// ---------------------------------------------------------------------------
// Founding offer. These are FULFILMENT PROMISES, not coupon codes — they are
// written onto the subscription row at signup.
// ---------------------------------------------------------------------------

export const FOUNDING_OFFER = {
  headline: 'Founding neighbor offer',
  promises: [
    'Your founding rate is locked — your price never rises',
    'One free premium add-on on your first visit',
    'First visit perfect or it’s free',
    'Capped at 25 founding homes per ZIP',
  ],
  inExchangeFor: 'in exchange for a review after your second visit',
  homesPerZip: 25,
} as const;

// ---------------------------------------------------------------------------
// Trust claims — only what is provable. "Insured" is NOT published yet: the
// general liability certificate is outstanding. Flip INSURANCE_VERIFIED to true
// in one edit once the certificate is in hand; every insured/insurance claim in
// customer-facing copy is gated on it.
// ---------------------------------------------------------------------------

export const INSURANCE_VERIFIED = false;
export const INSURED_CLAIM = 'Insured';

/**
 * Badge/chip claim. "Vetted" is a RETIRED string — it is vague and
 * unsupportable. The only approved claim is "Background-Checked Pros".
 */
export const VETTED_CLAIM = INSURANCE_VERIFIED
  ? 'Background-Checked & Insured'
  : 'Background-Checked Pros';

/** Prose form used in sentences about who shows up. */
export const VETTED_PROS_SENTENCE = INSURANCE_VERIFIED
  ? 'insured, background-checked'
  : 'background-checked';


export const TRUST_CLAIMS = [
  'Background-Checked Pros',
  'Photo-Verified Every Visit',
  'Cancel Anytime',
  'Same Pro Every Time',
  'Serving Kendall & Pinecrest',
] as const;

export function trustClaims(): string[] {
  return INSURANCE_VERIFIED ? [...TRUST_CLAIMS, INSURED_CLAIM] : [...TRUST_CLAIMS];
}

// ---------------------------------------------------------------------------
// Service area — never "South Florida", never "South Miami".
// ---------------------------------------------------------------------------

export const SERVICE_AREA_ZIPS = ['33156', '33183', '33186'] as const;
// Matches the /neighbor line exactly — Palmetto Bay is not in the served set.
export const SERVICE_AREA_LINE = 'Serving Pinecrest & Kendall — 33156, 33183, 33186';
export const SERVICE_AREA_SHORT = 'Pinecrest, Kendall & Palmetto Bay';

// ---------------------------------------------------------------------------
// Contractor pay — a share of LIST price with a per-visit floor.
// ---------------------------------------------------------------------------

export const CONTRACTOR_PAY = {
  tier1: { pct: 45, floorDollars: 30 },
  tier2: { pct: 50, floorDollars: 35 },
} as const;

export function contractorPayForVisit(listDollars: number, tier: 1 | 2): number {
  const rule = tier === 2 ? CONTRACTOR_PAY.tier2 : CONTRACTOR_PAY.tier1;
  return Math.max((listDollars * rule.pct) / 100, rule.floorDollars);
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export function sizePrice(service: CanonService, size: CanonSize): number {
  return SIZE_PRICES[service][size];
}

export function sizePriceCents(service: CanonService, size: CanonSize): number {
  return Math.round(sizePrice(service, size) * 100);
}

/** Stripe subscription quantity for a line. */
export function quantityFor(service: CanonService, cadence: CanonCadence): number {
  return SERVICE_QUANTITY_RULE[service] === 'always_1' ? 1 : CADENCE_MULTIPLIER[cadence];
}

/** Monthly billed amount for one service line. */
export function monthlyPrice(service: CanonService, size: CanonSize, cadence: CanonCadence): number {
  return sizePrice(service, size) * quantityFor(service, cadence);
}

// ---------------------------------------------------------------------------
// Sizing. The customer is never asked to look anything up or measure anything.
// ---------------------------------------------------------------------------

/**
 * Cleaning size from bedrooms, with bathrooms as the only modifier: more baths
 * than the size allows moves the home up one size. 5+ bedrooms is a quote.
 */
export function sizeFromBedrooms(bedrooms: number, bathrooms: number): SizeSelection {
  if (bedrooms >= 5) return 'quote';
  const base: CanonSize = bedrooms <= 2 ? 1 : bedrooms === 3 ? 2 : 3;
  const bathLimit: Record<CanonSize, number> = { 1: 2, 2: 2.5, 3: 3 };
  if (bathrooms > bathLimit[base]) {
    return base === 3 ? 'quote' : ((base + 1) as CanonSize);
  }
  return base;
}

export const BATH_LIMITS: Record<CanonSize, number> = { 1: 2, 2: 2.5, 3: 3 };

/** Lawn size from mowable turf area. Over 10,000 sq ft is a quote. */
export function sizeFromTurfSqFt(sqft: number): SizeSelection {
  if (sqft <= 3000) return 1;
  if (sqft <= 6000) return 2;
  if (sqft <= 10000) return 3;
  return 'quote';
}

/** What the customer drives → size. */
export type VehicleClass = 'sedan' | 'coupe' | 'suv' | 'crossover' | 'truck' | 'suv3row' | 'van';

export const VEHICLE_CLASS_SIZE: Record<VehicleClass, CanonSize> = {
  sedan: 1,
  coupe: 1,
  suv: 2,
  crossover: 2,
  truck: 3,
  suv3row: 3,
  van: 3,
};

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  sedan: 'sedan',
  coupe: 'coupe',
  suv: 'SUV',
  crossover: 'crossover',
  truck: 'pickup truck',
  suv3row: '3-row SUV',
  van: 'van or minivan',
};

/** Shown beside the lawn selector, verbatim. */
export const LAWN_GUESS_NOTE =
  'Not sure? Pick your best guess — we confirm the exact size from satellite imagery before your first visit, and we’ll tell you before we start if it’s different.';

// ---------------------------------------------------------------------------
// What every visit includes. Published on the pricing page and in the FAQ.
// ---------------------------------------------------------------------------

export const CLEANING_INCLUDED = [
  'kitchen surfaces and appliance exteriors',
  'all bathrooms',
  'floors vacuumed and mopped',
  'dusting of reachable surfaces',
  'beds made',
  'trash out',
];

export const CLEANING_PAID_ADDONS = [
  'inside oven',
  'inside fridge',
  'interior windows',
  'baseboards',
  'blinds',
  'walls',
  'laundry',
  'dishes',
  'garage',
  'patio',
  'organising',
];

export const LAWN_INCLUDED = ['mow', 'edge', 'line-trim', 'blow clear of hard surfaces'];

export const SHINE_MAINTENANCE_WASH = [
  'hand wash',
  'wheels',
  'tires',
  'tire shine',
  'spot-free dry',
  'all glass in and out',
  'full interior vacuum',
  'dash',
  'console',
  'door panels',
];

export const SHINE_FULL_DETAIL = [
  'clay bar decontamination',
  'machine-applied paint sealant',
  'interior shampoo and extraction',
  'leather deep clean and condition',
  'engine bay',
  'trim restoration',
];

export const SHINE_SUMMARY = '3 maintenance washes every month plus 2 full details every year';

// ---------------------------------------------------------------------------
// How sizing works — published verbatim on the pricing page and in the FAQ.
// ---------------------------------------------------------------------------

export const SIZING_FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I know which size I am?',
    a: 'Bedrooms for cleaning, what you drive for car care. For lawn, pick small, standard or large — we confirm it from satellite imagery before your first visit. You never have to measure anything.',
  },
  {
    q: 'What if I pick the wrong size?',
    a: 'We move you to the right price before your second visit. We never bill you retroactively for the first.',
  },
  {
    q: 'What if I have more bathrooms than my size allows?',
    a: 'Your home moves up one size. Bathrooms drive the length of a visit more than anything else.',
  },
  {
    q: 'What if I have 5+ bedrooms, or more than 10,000 sq ft of lawn?',
    a: "Call us and we'll quote it. It isn't a worse deal, it just isn't a checkbox.",
  },
  {
    q: 'What happens if a visit takes longer than expected?',
    a: 'Nothing. The size price is the price.',
  },
  {
    q: 'Can I change how often you come?',
    a: 'Yes, from your dashboard, effective next billing cycle.',
  },
];

/** The quote path. No checkout button is ever shown for a quote-sized property. */
export const QUOTE_PHONE = '(786) 829-1141';
export const QUOTE_COPY = "Call for a quote — we'll price it by hand.";
