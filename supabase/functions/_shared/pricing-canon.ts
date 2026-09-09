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
export const CADENCES: CanonCadence[] = ['monthly', 'biweekly', 'weekly'];

/** Visits performed (and billed) per month at each cadence. */
export const VISITS_PER_MONTH: Record<CanonCadence, number> = {
  monthly: 1,
  biweekly: 2,
  weekly: 4,
};

/** Volume curve on the per-visit price. Monthly is the reference. */
export const CADENCE_FACTOR: Record<CanonCadence, number> = {
  monthly: 1,
  biweekly: 0.92,
  weekly: 0.82,
};

/** Legacy alias — visits per month, NOT a price multiplier. */
export const CADENCE_MULTIPLIER = VISITS_PER_MONTH;

/**
 * Per-visit price in whole dollars, by service, size and cadence.
 * Shine Complete is not per visit — see SHINE_MONTHLY.
 */
export const PER_VISIT_PRICES: Record<'cleaning' | 'lawn', Record<CanonSize, Record<CanonCadence, number>>> = {
  cleaning: {
    1: { monthly: 139, biweekly: 128, weekly: 114 },
    2: { monthly: 189, biweekly: 174, weekly: 155 },
    3: { monthly: 279, biweekly: 257, weekly: 229 },
  },
  lawn: {
    1: { monthly: 45, biweekly: 41, weekly: 37 },
    2: { monthly: 65, biweekly: 60, weekly: 53 },
    3: { monthly: 99, biweekly: 91, weekly: 81 },
  },
};

/** The amount actually billed every month. This is what the customer pays. */
export const BILLED_MONTHLY: Record<CanonService, Record<CanonSize, Record<CanonCadence, number>>> = {
  cleaning: {
    1: { monthly: 139, biweekly: 256, weekly: 456 },
    2: { monthly: 189, biweekly: 348, weekly: 620 },
    3: { monthly: 279, biweekly: 514, weekly: 916 },
  },
  lawn: {
    1: { monthly: 45, biweekly: 82, weekly: 148 },
    2: { monthly: 65, biweekly: 120, weekly: 212 },
    3: { monthly: 99, biweekly: 182, weekly: 324 },
  },
  // Shine Complete has no frequency choice — one monthly plan per size.
  detailing: {
    1: { monthly: 149, biweekly: 149, weekly: 149 },
    2: { monthly: 179, biweekly: 179, weekly: 179 },
    3: { monthly: 239, biweekly: 239, weekly: 239 },
  },
};

/** Shine Complete monthly price by size. */
export const SHINE_MONTHLY: Record<CanonSize, number> = { 1: 149, 2: 179, 3: 239 };

/**
 * The headline figure for a service at its smallest size: the MONTHLY BILL.
 * "House cleaning from $139 a month. Lawn care from $45 a month.
 *  Shine Complete from $149 a month."
 */
export const SIZE_PRICES: Record<CanonService, Record<CanonSize, number>> = {
  cleaning: { 1: 139, 2: 189, 3: 279 },
  lawn: { 1: 45, 2: 65, 3: 99 },
  detailing: { 1: 149, 2: 179, 3: 239 },
};

/**
 * Stripe lookup keys — 21 recurring prices, every one interval=month.
 * Shine Complete has one key per size, reused across cadences because it has
 * no cadence choice.
 */
export const SERVICE_LOOKUP_KEYS: Record<CanonService, Record<CanonSize, Record<CanonCadence, string>>> = {
  cleaning: {
    1: { monthly: 'clean_1_monthly', biweekly: 'clean_1_biweekly', weekly: 'clean_1_weekly' },
    2: { monthly: 'clean_2_monthly', biweekly: 'clean_2_biweekly', weekly: 'clean_2_weekly' },
    3: { monthly: 'clean_3_monthly', biweekly: 'clean_3_biweekly', weekly: 'clean_3_weekly' },
  },
  lawn: {
    1: { monthly: 'lawn_1_monthly', biweekly: 'lawn_1_biweekly', weekly: 'lawn_1_weekly' },
    2: { monthly: 'lawn_2_monthly', biweekly: 'lawn_2_biweekly', weekly: 'lawn_2_weekly' },
    3: { monthly: 'lawn_3_monthly', biweekly: 'lawn_3_biweekly', weekly: 'lawn_3_weekly' },
  },
  detailing: {
    1: { monthly: 'shine_1', biweekly: 'shine_1', weekly: 'shine_1' },
    2: { monthly: 'shine_2', biweekly: 'shine_2', weekly: 'shine_2' },
    3: { monthly: 'shine_3', biweekly: 'shine_3', weekly: 'shine_3' },
  },
};

export function lookupKeyFor(service: CanonService, size: CanonSize, cadence: CanonCadence): string {
  return SERVICE_LOOKUP_KEYS[service][size][cadenceFor(service, cadence)];
}

/** Shine Complete is always monthly, whatever the UI last remembered. */
export function cadenceFor(service: CanonService, cadence: CanonCadence): CanonCadence {
  return SERVICE_QUANTITY_RULE[service] === 'always_1' ? 'monthly' : cadence;
}

/** The 21 live recurring lookup keys, in catalogue order. */
export const ALL_RECURRING_LOOKUP_KEYS: string[] = [
  ...(['cleaning', 'lawn'] as const).flatMap((service) =>
    SIZES.flatMap((size) => CADENCES.map((cadence) => SERVICE_LOOKUP_KEYS[service][size][cadence])),
  ),
  ...SIZES.map((size) => SERVICE_LOOKUP_KEYS.detailing[size].monthly),
];

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
  detailing: 'Car Care · Shine Complete',
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

// ---------------------------------------------------------------------------
// Surcharges — per visit, so they scale with cadence exactly like the plan.
// Above these bands, and at 5+ bedrooms, the property goes to a quote form and
// NEVER to checkout.
// ---------------------------------------------------------------------------

export const CLEANING_SURCHARGE = {
  perVisitDollars: 60,
  minSqFt: 2501,
  maxSqFt: 4000,
  label: '2,501–4,000 sq ft',
} as const;

export const LAWN_SURCHARGE = {
  perVisitDollars: 30,
  minSqFt: 4001,
  maxSqFt: 7500,
  label: '4,001–7,500 sq ft of turf',
} as const;

/** Cleaning surcharge per visit for a home's interior square footage. */
export function cleaningSurchargePerVisit(sqft: number | null | undefined): number {
  if (!sqft) return 0;
  if (sqft > CLEANING_SURCHARGE.maxSqFt) return 0; // quote path, never priced here
  return sqft >= CLEANING_SURCHARGE.minSqFt ? CLEANING_SURCHARGE.perVisitDollars : 0;
}

/** Lawn surcharge per visit for a yard's mowable turf area. */
export function lawnSurchargePerVisit(sqft: number | null | undefined): number {
  if (!sqft) return 0;
  if (sqft > LAWN_SURCHARGE.maxSqFt) return 0;
  return sqft >= LAWN_SURCHARGE.minSqFt ? LAWN_SURCHARGE.perVisitDollars : 0;
}

/** True when the property is above every purchasable band — quote by hand. */
export function cleaningNeedsQuote(bedrooms: number, sqft?: number | null): boolean {
  return bedrooms >= 5 || (!!sqft && sqft > CLEANING_SURCHARGE.maxSqFt);
}

// ---------------------------------------------------------------------------
// Car Wash Add-On — per month, requires an active lawn or cleaning plan.
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
// or more distinct services. There is no three-service tier. The CUSTOMER
// CHOOSES which add-on they take each month; we never assign one.
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
// Entry prices and referral. Headline figures are MONTHLY BILLS.
// ---------------------------------------------------------------------------

/** Lowest monthly bill per service. */
export const ENTRY_MONTHLY: Record<CanonService, number> = {
  cleaning: BILLED_MONTHLY.cleaning[1].monthly,
  lawn: BILLED_MONTHLY.lawn[1].monthly,
  detailing: SHINE_MONTHLY[1],
};

/** The single company-wide entry price: the cheapest monthly bill we sell. */
export const ENTRY_PRICE_MONTHLY = ENTRY_MONTHLY.lawn;
export const ENTRY_PRICE_COPY = `from $${ENTRY_PRICE_MONTHLY} a month`;

export const HEADLINE_PRICE_COPY =
  `House cleaning from $${ENTRY_MONTHLY.cleaning} a month. ` +
  `Lawn care from $${ENTRY_MONTHLY.lawn} a month. ` +
  `Shine Complete from $${ENTRY_MONTHLY.detailing} a month.`;

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
    'One free premium add-on on your first visit — $45 value',
    'First visit perfect or it’s free',
    'Capped at 25 founding homes per ZIP',
  ],
  homesPerZip: 25,
} as const;

// ---------------------------------------------------------------------------
// Trust claims — only what is provable.
// ---------------------------------------------------------------------------

export const INSURANCE_VERIFIED = false;
export const INSURED_CLAIM = 'Insured';

export const VETTED_CLAIM = INSURANCE_VERIFIED
  ? 'Background-Checked & Insured'
  : 'Background-Checked Pros';

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
export const SERVICE_AREA_LINE = 'Serving Pinecrest, Kendall and Kendall West — 33156, 33183, 33186';
export const SERVICE_AREA_SHORT = 'Pinecrest, Kendall & Kendall West';

// ---------------------------------------------------------------------------
// CONTRACTOR PAY — 40% of the visit price. NEVER shown to a customer.
// Figures are explicit dollars so no rounding rule can drift.
// ---------------------------------------------------------------------------

/** Pay per completed visit, by service, size and the plan's cadence. */
export const CONTRACTOR_VISIT_PAY: Record<'cleaning' | 'lawn', Record<CanonSize, Record<CanonCadence, number>>> = {
  cleaning: {
    1: { monthly: 56, biweekly: 51, weekly: 46 },
    2: { monthly: 76, biweekly: 70, weekly: 62 },
    3: { monthly: 112, biweekly: 103, weekly: 92 },
  },
  lawn: {
    1: { monthly: 18, biweekly: 16, weekly: 15 },
    2: { monthly: 26, biweekly: 24, weekly: 21 },
    3: { monthly: 40, biweekly: 36, weekly: 32 },
  },
};

/** Shine Complete pay, by size. */
export const CONTRACTOR_SHINE_PAY: Record<CanonSize, { maintenanceWash: number; fullDetail: number }> = {
  1: { maintenanceWash: 17, fullDetail: 51 },
  2: { maintenanceWash: 20, fullDetail: 61 },
  3: { maintenanceWash: 27, fullDetail: 82 },
};

/** The pro's share of a surcharge, per visit. */
export const CONTRACTOR_SURCHARGE_PAY = { cleaning: 24, lawn: 12 } as const;

/** Tier 2 pros earn +10% on every figure, rounded to the dollar. */
export const TIER_2_UPLIFT = 1.1;

export function withTier(dollars: number, tier: 1 | 2): number {
  return tier === 2 ? Math.round(dollars * TIER_2_UPLIFT) : dollars;
}

/**
 * Pay for one visit. Surcharge share is added when the property carries one.
 * A weekly cleaning plan's quarterly deep clean is paid as an EXTRA visit at
 * the MONTHLY rate for that size — pass cadence 'monthly' for that visit.
 */
export function contractorVisitPay(args: {
  service: CanonService;
  size: CanonSize;
  cadence: CanonCadence;
  tier?: 1 | 2;
  surcharge?: boolean;
  /** Shine only: which kind of car visit this is. */
  shineVisit?: 'maintenance_wash' | 'full_detail';
}): number {
  const tier = args.tier ?? 1;
  if (args.service === 'detailing') {
    const pay = CONTRACTOR_SHINE_PAY[args.size];
    return withTier(args.shineVisit === 'full_detail' ? pay.fullDetail : pay.maintenanceWash, tier);
  }
  const base = CONTRACTOR_VISIT_PAY[args.service][args.size][cadenceFor(args.service, args.cadence)];
  const surcharge = args.surcharge ? CONTRACTOR_SURCHARGE_PAY[args.service] : 0;
  return withTier(base + surcharge, tier);
}

/** Pay for the quarterly deep clean that comes with a weekly cleaning plan. */
export function quarterlyDeepCleanPay(size: CanonSize, tier: 1 | 2 = 1, surcharge = false): number {
  return contractorVisitPay({ service: 'cleaning', size, cadence: 'monthly', tier, surcharge });
}

/**
 * A visit that is free to the customer, or blocked through no fault of the pro,
 * is PAID IN FULL. The reason is REQUIRED and audited — the database rejects a
 * blocked visit without one. Pros may only report the first two themselves;
 * the rest are admin-only.
 */
export const PAY_IN_FULL_WHEN_BLOCKED = true;

export const PAID_IN_FULL_REASONS = [
  'customer_no_access',
  'unsafe_conditions',
  'customer_canceled_same_day',
  'customer_free_visit',
  'first_visit_guarantee',
  'company_error',
] as const;
export type PaidInFullReason = (typeof PAID_IN_FULL_REASONS)[number];
export const PRO_REPORTABLE_PAID_IN_FULL_REASONS: PaidInFullReason[] = ['customer_no_access', 'unsafe_conditions'];

/** The pro's share of anything priced per job: base visits, surcharges and add-ons. */
export const CONTRACTOR_PAY_SHARE = 0.4;

/** Tier 2: +10% on the Tier 1 DOLLAR figure, rounded to the dollar. Cents in, cents out. */
export function withTierCents(cents: number, tier: 1 | 2): number {
  return tier === 2 ? Math.round((cents / 100) * TIER_2_UPLIFT) * 100 : cents;
}

/** Maps the applicants.tier column (the only two values its CHECK allows) to the pay tier. */
export function payTierFor(tier: string | null | undefined): 1 | 2 {
  return tier === 'tier_2_pro_partner' ? 2 : 1;
}

/**
 * Pro pay for an approved walkaround add-on, in cents: 40% of the catalog
 * price, then the Tier 2 uplift on the dollar figure. No other tier exists.
 */
export function addonContractorPayCents(amountCents: number, tier: string | null | undefined): number {
  return withTierCents(Math.round(amountCents * CONTRACTOR_PAY_SHARE), payTierFor(tier));
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

/** Per-visit price for a size at a cadence. Shine returns its monthly price. */
export function perVisitPrice(service: CanonService, size: CanonSize, cadence: CanonCadence): number {
  if (service === 'detailing') return SHINE_MONTHLY[size];
  return PER_VISIT_PRICES[service][size][cadence];
}

/** The headline (size-1-style) figure: monthly bill at the monthly cadence. */
export function sizePrice(service: CanonService, size: CanonSize): number {
  return SIZE_PRICES[service][size];
}

export function sizePriceCents(service: CanonService, size: CanonSize): number {
  return Math.round(sizePrice(service, size) * 100);
}

/** Every Stripe price is a flat monthly amount, so quantity is always 1. */
export function quantityFor(_service: CanonService, _cadence: CanonCadence): number {
  return 1;
}

/** Visits a month for a service at a cadence. Shine is its own schedule. */
export function visitsPerMonthFor(service: CanonService, cadence: CanonCadence): number {
  return SERVICE_QUANTITY_RULE[service] === 'always_1' ? 1 : VISITS_PER_MONTH[cadence];
}

/** Monthly billed amount for one service line, including any surcharge. */
export function monthlyPrice(
  service: CanonService,
  size: CanonSize,
  cadence: CanonCadence,
  surchargePerVisit = 0,
): number {
  const billed = BILLED_MONTHLY[service][size][cadenceFor(service, cadence)];
  if (service === 'detailing') return billed;
  return billed + surchargePerVisit * VISITS_PER_MONTH[cadence];
}

export function monthlyPriceCents(
  service: CanonService,
  size: CanonSize,
  cadence: CanonCadence,
  surchargePerVisit = 0,
): number {
  return Math.round(monthlyPrice(service, size, cadence, surchargePerVisit) * 100);
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
  'organizing',
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

// ---------------------------------------------------------------------------
// Car service variants — Car Wash and Car Detail are mutually exclusive.
// ---------------------------------------------------------------------------

export type CarServiceCode = 'car_wash' | 'car_detail';

export const CAR_SERVICE_DEFAULT_DURATION_MINUTES: Record<CarServiceCode, number> = {
  car_wash: 60,
  car_detail: 210,
};


/** app_settings keys an admin can edit to override the default duration. */
export const CAR_SERVICE_DURATION_SETTINGS_KEY: Record<CarServiceCode, string> = {
  car_wash: 'car_wash_duration_minutes',
  car_detail: 'car_detail_duration_minutes',
};

export const CAR_SERVICE_NAMES: Record<CarServiceCode, string> = {
  car_wash: 'Car Wash',
  car_detail: 'Car Detail',
};
