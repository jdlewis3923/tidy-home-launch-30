// Money guard. What we DISPLAY must equal what Stripe CHARGES.
//
//   client ConfigState
//     -> src/lib/checkout.ts translate()             (the real payload builder)
//     -> lookup_key per service/size                 (the real resolution path)
//     -> cadence as subscription-item quantity       (the real server rule)
//     -> add-on price_cents from setup-stripe-catalog (the real catalog seed)
//
// There are no coupons and no percentage discounts in this model: bundling
// earns one free premium add-on, so the charged subtotal is simply the sum of the
// line items. If the two ever diverge again, this fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import { FLORIDA_TAX, cartTriggersFloridaTax, FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';
import {
  CAR_WASH_LOOKUP_KEYS,
  CAR_WASH_PRICES,
  SERVICE_LOOKUP_KEYS,
  SIZE_PRICES,
  freeAddonsPerMonth,
  quantityFor,
  type CanonSize,
  type VehicleClass,
  type WashCount,
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

  let subtotalCents = 0;
  for (const s of services) {
    // The server resolves the price by lookup_key and sets the quantity from
    // the cadence — mirrored exactly here.
    const key = SERVICE_LOOKUP_KEYS[s.service][s.size];
    expect(key, `${s.service}:${s.size}`).toBeTruthy();
    subtotalCents += SIZE_PRICES[s.service][s.size] * 100 * quantityFor(s.service, s.frequency);
  }
  if (car_wash) {
    expect(CAR_WASH_LOOKUP_KEYS[car_wash.size][car_wash.washes]).toBeTruthy();
    subtotalCents += CAR_WASH_PRICES[car_wash.size][car_wash.washes] * 100;
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
  opts: { size?: CanonSize; addOns?: string[]; washes?: WashCount; cadence?: Frequency } = {},
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
    carWashes: opts.washes ?? null,
    addOns: opts.addOns ?? [],
  });
}

describe('checkout ↔ Stripe parity', () => {
  it('the add-on seed is present and complete', () => {
    expect(addonCatalog.length).toBeGreaterThanOrEqual(15);
    // The one-time driveway pressure wash survives the rebuild.
    expect(read('supabase/functions/setup-stripe-catalog/index.ts')).toMatch(/pressure/i);
  });

  it('the server resolves prices by lookup key and sets cadence with quantity', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    expect(src).toContain('lookup_key');
    expect(src).toContain('quantityFor(s.service, s.frequency)');
    expect(src).not.toContain('r.frequency === s.frequency');
  });

  it('no coupon or promo-code machinery reaches Stripe', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    for (const dead of ['TIDY_BUNDLE_', 'percent_off', 'allow_promotion_codes', 'discounts:']) {
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
    { label: 'cleaning + car wash add-on', s: buildState(['cleaning'], { washes: 2 }) },
    { label: 'detailing only + coating add-on', s: buildState(['detailing'], { addOns: ['clayBarCeramic'] }) },
  ];

  for (const { label, s } of combos) {
    it(`displayed total === Stripe amount — ${label}`, () => {
      const displayedCents = Math.round(calculatePricing(s).ongoing * 100);
      expect(Math.round(stripeSubscriptionCents(s))).toBe(displayedCents);
    });
  }

  it('cadence multiplies the per-visit price, exactly', () => {
    const weekly = buildState(['lawn'], { size: 2, cadence: 'weekly' });
    expect(Math.round(stripeSubscriptionCents(weekly))).toBe(65 * 4 * 100);
    const biweekly = buildState(['cleaning'], { size: 2, cadence: 'biweekly' });
    expect(Math.round(stripeSubscriptionCents(biweekly))).toBe(189 * 2 * 100);
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
