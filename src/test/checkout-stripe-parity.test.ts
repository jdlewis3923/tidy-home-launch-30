// Money guard. What we DISPLAY must equal what Stripe CHARGES.
//
//   client ConfigState
//     -> src/lib/checkout.ts translate()              (the real payload builder)
//     -> lookup_key per service/size/cadence          (the real resolution path)
//     -> one monthly Stripe price, quantity 1         (the real server rule)
//     -> surcharge as its own monthly line            (the real server rule)
//     -> add-on price_cents from setup-stripe-catalog (the real catalog seed)
//
// No coupons and no percentage discounts exist: bundling earns one free premium
// add-on, so the charged subtotal is the sum of the line items.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import { FLORIDA_TAX, cartTriggersFloridaTax, FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';
import {
  BILLED_MONTHLY,
  VISITS_PER_MONTH,
  cleaningSurchargePerVisit,
  freeAddonsPerMonth,
  lawnSurchargePerVisit,
  lookupKeyFor,
  monthlyPriceCents,
  quantityFor,
  type CanonSize,
  type VehicleClass,
} from '@/lib/pricing-canon';

import {
  calculatePricing,
  defaultState,
  sizeFor,
  type ConfigState,
  type Frequency,
  type LawnChoice,
  type ServiceType,
} from '@/lib/dashboard-pricing';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// ---------- The real add-on catalog rows (price_cents per addon) ----------
type AddonRow = { addon_name: string; price_cents: number };

function loadAddons(): AddonRow[] {
  const src = read('supabase/functions/setup-stripe-catalog/index.ts');
  const rows: AddonRow[] = [];
  const re = /addon_name:\s*'([A-Za-z_]+)',\s*stripe_price_id:\s*'[^']+',\s*price_cents:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) rows.push({ addon_name: m[1], price_cents: Number(m[2]) });
  return rows;
}

const addonCatalog = loadAddons();

/** Simulates the Stripe subscription amount in cents for a ConfigState. */
function stripeSubscriptionCents(state: ConfigState): number {
  const { services, addons, car_wash } = translate(state);
  // The standalone wash is retired: no wash line can be produced any more.
  expect(car_wash).toBeUndefined();

  let subtotalCents = 0;
  for (const s of services) {
    const key = lookupKeyFor(s.service, s.size, s.frequency);
    expect(key, `${s.service}:${s.size}:${s.frequency}`).toBeTruthy();
    // One monthly price at quantity 1 — the key already carries the cadence.
    expect(quantityFor(s.service, s.frequency)).toBe(1);
    subtotalCents += BILLED_MONTHLY[s.service][s.size][s.service === 'detailing' ? 'monthly' : s.frequency] * 100;

    // The surcharge is its own monthly line: per-visit amount x visits a month.
    const perVisitSurcharge =
      s.service === 'cleaning'
        ? cleaningSurchargePerVisit(s.sq_ft)
        : s.service === 'lawn'
          ? lawnSurchargePerVisit(s.sq_ft)
          : 0;
    if (perVisitSurcharge > 0) {
      subtotalCents += perVisitSurcharge * VISITS_PER_MONTH[s.frequency] * 100;
    }
    // Same figure the canon publishes for the whole line.
    expect(
      BILLED_MONTHLY[s.service][s.size][s.service === 'detailing' ? 'monthly' : s.frequency] * 100 +
        perVisitSurcharge * VISITS_PER_MONTH[s.frequency] * 100,
    ).toBe(monthlyPriceCents(s.service, s.size, s.frequency, perVisitSurcharge));
  }
  for (const a of addons) {
    const row = addonCatalog.find((r) => r.addon_name === a.addon_name);
    if (!row) throw new Error(`no catalog price for addon ${a.addon_name}`);
    subtotalCents += row.price_cents * a.qty;
  }

  // Then the exclusive FL TaxRate, when collection is on and a coating is in cart.
  const taxCents =
    FL_SALES_TAX_COLLECTION_ENABLED && cartTriggersFloridaTax(addons)
      ? Math.round(subtotalCents * (FLORIDA_TAX.percentage / 100))
      : 0;
  return subtotalCents + taxCents;
}

const st = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

const bedBathForSize: Record<CanonSize, [string, string]> = {
  1: ['2', '2'],
  2: ['3', '2'],
  3: ['4', '3'],
};
const lawnForSize: Record<CanonSize, LawnChoice> = { 1: 'small', 2: 'standard', 3: 'large' };
const vehicleForSize: Record<CanonSize, VehicleClass> = { 1: 'sedan', 2: 'crossover', 3: 'truck' };

const freq: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'monthly',
  detailing: 'monthly',
};

function buildState(
  servicesIn: ServiceType[],
  opts: { size?: CanonSize; addOns?: string[]; cadence?: Frequency; homeSqFt?: number; turfSqFt?: number } = {},
): ConfigState {
  const size = opts.size ?? 2;
  const frequencies: Partial<Record<ServiceType, Frequency>> = {};
  for (const s of servicesIn) frequencies[s] = opts.cadence ?? freq[s];
  const [bedrooms, bathrooms] = bedBathForSize[size];
  return st({
    services: servicesIn,
    frequencies,
    bedrooms: servicesIn.includes('cleaning') ? bedrooms : null,
    bathrooms: servicesIn.includes('cleaning') ? bathrooms : null,
    lawnChoice: servicesIn.includes('lawn') ? lawnForSize[size] : null,
    vehicleClass: vehicleForSize[size],
    homeSqFt: opts.homeSqFt ?? null,
    turfSqFt: opts.turfSqFt ?? null,
    carWashes: null,
    addOns: opts.addOns ?? [],
  });
}

describe('checkout ↔ Stripe parity', () => {
  it('the add-on seed is present and complete', () => {
    expect(addonCatalog.length).toBeGreaterThanOrEqual(15);
    expect(read('supabase/functions/setup-stripe-catalog/index.ts')).toMatch(/pressure/i);
  });

  it('the server resolves prices by lookup key and bills one monthly price', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    expect(src).toContain('lookup_key');
    expect(src).toContain('lookupKeyFor(s.service, size, cadence)');
    expect(src).toContain('quantityFor(s.service, cadence)');
  });

  it('no percentage or promo-code machinery reaches Stripe', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    for (const dead of ['TIDY_BUNDLE_', 'percent_off', 'allow_promotion_codes', 'promotion_code']) {
      expect(src).not.toContain(dead);
    }
  });

  const combos: Array<{ label: string; s: ConfigState }> = [
    { label: '1 service · size 2', s: buildState(['cleaning']) },
    { label: '2 services · size 2', s: buildState(['cleaning', 'lawn']) },
    { label: '3 services · size 2', s: buildState(['cleaning', 'lawn', 'detailing']) },
    { label: '3 services · size 1', s: buildState(['cleaning', 'lawn', 'detailing'], { size: 1 }) },
    { label: '3 services · size 3', s: buildState(['cleaning', 'lawn', 'detailing'], { size: 3 }) },
    { label: '3 services · weekly', s: buildState(['cleaning', 'lawn', 'detailing'], { cadence: 'weekly' }) },
    {
      label: '3 services + add-ons',
      s: buildState(['cleaning', 'lawn', 'detailing'], { addOns: ['oven', 'bedEdgeReset', 'headlightRestoration'] }),
    },
    { label: 'cleaning with the larger-home surcharge', s: buildState(['cleaning'], { homeSqFt: 3200 }) },
    { label: 'lawn with the larger-yard surcharge', s: buildState(['lawn'], { turfSqFt: 5200 }) },
    { label: 'detailing only + coating add-on', s: buildState(['detailing'], { addOns: ['clayBarCeramic'] }) },
  ];

  for (const { label, s } of combos) {
    it(`displayed total === Stripe amount — ${label}`, () => {
      const displayedCents = Math.round(calculatePricing(s).ongoing * 100);
      expect(Math.round(stripeSubscriptionCents(s))).toBe(displayedCents);
    });
  }

  it('cadence lowers the per-visit price and sets the monthly bill', () => {
    const weekly = buildState(['lawn'], { size: 2, cadence: 'weekly' });
    expect(Math.round(stripeSubscriptionCents(weekly))).toBe(212 * 100);
    const biweekly = buildState(['cleaning'], { size: 2, cadence: 'biweekly' });
    expect(Math.round(stripeSubscriptionCents(biweekly))).toBe(348 * 100);
    const monthly = buildState(['cleaning'], { size: 2, cadence: 'monthly' });
    expect(Math.round(stripeSubscriptionCents(monthly))).toBe(189 * 100);
  });

  it('Shine Complete stays flat however often the cadence field says', () => {
    const monthly = buildState(['detailing'], { size: 2, cadence: 'monthly' });
    const weekly = buildState(['detailing'], { size: 2, cadence: 'weekly' });
    expect(stripeSubscriptionCents(weekly)).toBe(stripeSubscriptionCents(monthly));
    expect(Math.round(stripeSubscriptionCents(monthly))).toBe(179 * 100);
  });

  it('bundling adds a free monthly add-on, never a discount on the charge', () => {
    const one = buildState(['cleaning']);
    const two = buildState(['cleaning', 'lawn']);
    expect(Math.round(stripeSubscriptionCents(two))).toBe(
      Math.round(stripeSubscriptionCents(one)) + 65 * 100,
    );
    expect(calculatePricing(two).freeAddons).toBe(freeAddonsPerMonth(2));
  });

  it('a quote-only cart never reaches Stripe', () => {
    const over = st({
      services: ['lawn'],
      frequencies: { lawn: 'monthly' },
      lawnChoice: 'over',
    });
    expect(sizeFor(over, 'lawn')).toBe('quote');
    expect(translate(over).services).toEqual([]);
  });
});
