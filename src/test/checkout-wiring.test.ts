// Checkout wiring guard — the numbers that double-bill a customer if wrong.
//
// The live-Stripe half of this proof is the `verify-checkout-wiring` edge
// function (15 lookup keys resolve, active, at the canon amount). This file
// pins everything that can be proven without a network call, and fails the
// build if any of it drifts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import {
  CAR_WASH_LOOKUP_KEYS,
  CAR_WASH_PRICES,
  SERVICE_LOOKUP_KEYS,
  SIZE_PRICES,
  quantityFor,
  type CanonSize,
  type WashCount,
} from '@/lib/pricing-canon';
import { calculatePricing, carWashEligible, defaultState, needsQuote, type ConfigState } from '@/lib/dashboard-pricing';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const st = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

const EXPECTED_KEYS = [
  'clean_1', 'clean_2', 'clean_3',
  'lawn_1', 'lawn_2', 'lawn_3',
  'shine_1', 'shine_2', 'shine_3',
  'wash_1_x1', 'wash_1_x2',
  'wash_2_x1', 'wash_2_x2',
  'wash_3_x1', 'wash_3_x2',
];

describe('1. the 15 lookup keys', () => {
  it('the canon publishes exactly these 15 keys', () => {
    const keys = [
      ...([1, 2, 3] as CanonSize[]).flatMap((s) => [
        SERVICE_LOOKUP_KEYS.cleaning[s],
        SERVICE_LOOKUP_KEYS.lawn[s],
        SERVICE_LOOKUP_KEYS.detailing[s],
      ]),
      ...([1, 2, 3] as CanonSize[]).flatMap((s) =>
        ([1, 2] as WashCount[]).map((w) => CAR_WASH_LOOKUP_KEYS[s][w]),
      ),
    ];
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('both checkout paths resolve Stripe by lookup key, never by a price literal', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      const src = read(p);
      expect(src).toContain('lookup_key');
      // A hardcoded recurring price ID is how an archived price gets booked.
      expect(src).not.toMatch(/['"]price_[A-Za-z0-9]+['"]/);
    }
  });

  it('the live check exists and fails on any unresolved key', () => {
    const src = read('supabase/functions/verify-checkout-wiring/index.ts');
    expect(src).toContain('lookup_keys: chunk');
    expect(src).toContain('all_keys_pass');
    expect(src).toContain('no_archived_selectable');
  });
});

describe('2. quantity carries cadence — for lawn and cleaning only', () => {
  it('cleaning and lawn are 1 / 2 / 4', () => {
    for (const svc of ['cleaning', 'lawn'] as const) {
      expect(quantityFor(svc, 'monthly')).toBe(1);
      expect(quantityFor(svc, 'biweekly')).toBe(2);
      expect(quantityFor(svc, 'weekly')).toBe(4);
    }
  });

  it('Shine Complete is always 1 — a monthly package, not a per-visit price', () => {
    expect(quantityFor('detailing', 'monthly')).toBe(1);
    expect(quantityFor('detailing', 'biweekly')).toBe(1);
    expect(quantityFor('detailing', 'weekly')).toBe(1);
  });

  it('the Car Wash Add-On line is always quantity 1', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      expect(read(p)).toContain('quantity: 1');
    }
  });
});

describe('3. the $427 reference cart', () => {
  const state = st({
    services: ['cleaning'],
    frequencies: { cleaning: 'biweekly' },
    bedrooms: '3',
    bathrooms: '2',
    vehicleClass: 'crossover',
    carWashes: 1,
  });

  it('clean_2 × 2 plus wash_2_x1 totals exactly $427.00', () => {
    const { services, car_wash } = translate(state);
    expect(services).toEqual([{ service: 'cleaning', size: 2, frequency: 'biweekly' }]);
    expect(car_wash).toEqual({ size: 2, washes: 1 });

    const cents =
      SIZE_PRICES.cleaning[2] * 100 * quantityFor('cleaning', 'biweekly') +
      CAR_WASH_PRICES[2][1] * 100;
    expect(cents).toBe(42700);
  });

  it('what we display equals that same $427.00', () => {
    expect(Math.round(calculatePricing(state).ongoing * 100)).toBe(42700);
  });
});

describe('4. oversized properties route to the quote path', () => {
  it('5 bedrooms produces no checkout line', () => {
    const state = st({
      services: ['cleaning'],
      frequencies: { cleaning: 'biweekly' },
      bedrooms: '5',
      bathrooms: '3',
    });
    expect(needsQuote(state)).toBe(true);
    expect(translate(state).services).toEqual([]);
  });

  it('turf over 10,000 sq ft produces no checkout line', () => {
    const state = st({ services: ['lawn'], frequencies: { lawn: 'monthly' }, lawnChoice: 'over' });
    expect(needsQuote(state)).toBe(true);
    expect(translate(state).services).toEqual([]);
  });
});

describe('5. the Car Wash Add-On requires a home plan', () => {
  it('detailing alone cannot carry a car wash', () => {
    const state = st({
      services: ['detailing'],
      frequencies: { detailing: 'monthly' },
      vehicleClass: 'sedan',
      carWashes: 1,
    });
    expect(carWashEligible(state)).toBe(false);
    expect(translate(state).car_wash).toBeUndefined();
  });

  it('cleaning or lawn makes it eligible', () => {
    for (const svc of ['cleaning', 'lawn'] as const) {
      const state = st({
        services: [svc],
        frequencies: { [svc]: 'monthly' },
        bedrooms: svc === 'cleaning' ? '3' : null,
        bathrooms: svc === 'cleaning' ? '2' : null,
        lawnChoice: svc === 'lawn' ? 'standard' : null,
        vehicleClass: 'sedan',
        carWashes: 1,
      });
      expect(carWashEligible(state)).toBe(true);
      expect(translate(state).car_wash).toEqual({ size: 1, washes: 1 });
    }
  });

  it('the server refuses a car wash without a home service', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      expect(read(p)).toContain('car_wash_requires_home_service');
    }
  });
});

describe('6. the founding offer is a persisted promise, not a coupon', () => {
  it('both checkout paths write the promises into subscription metadata', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      const src = read(p);
      expect(src).toContain('founding_rate_locked');
      expect(src).toContain('founding_free_addon_first_visit');
      expect(src).toContain('founding_zip');
    }
  });

  it('the webhook persists them onto the subscription row', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('founding_rate_locked: meta.founding_rate_locked');
    expect(src).toContain('founding_free_addon_first_visit: meta.founding_free_addon_first_visit');
    expect(src).toContain('founding_zip:');
  });

  // The ONE permitted coupon is the referred friend's $50-off-first-month
  // (see src/test/referral-discount.test.ts). No percentages, no promo codes.
  it('no percentage or promo-code machinery reaches Stripe', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    for (const dead of ['TIDY_BUNDLE_', 'percent_off', 'allow_promotion_codes', 'promotion_code']) {
      expect(src).not.toContain(dead);
    }
  });
});
