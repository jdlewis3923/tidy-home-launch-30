// Checkout wiring guard — the numbers that mis-bill a customer if wrong.
//
// The model: 21 recurring Stripe prices, all interval=month, at the BILLED
// monthly amount. Cadence lives in the lookup key and the price metadata, never
// in the quantity — every line is quantity 1.
//
// The live-Stripe half of this proof is the `verify-checkout-wiring` edge
// function. This file pins everything provable without a network call.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import {
  ALL_RECURRING_LOOKUP_KEYS,
  BILLED_MONTHLY,
  SERVICE_LOOKUP_KEYS,
  lookupKeyFor,
  quantityFor,
  type CanonSize,
} from '@/lib/pricing-canon';
import { calculatePricing, carWashEligible, defaultState, needsQuote, type ConfigState } from '@/lib/dashboard-pricing';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const st = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

const EXPECTED_KEYS = [
  'clean_1_monthly', 'clean_1_biweekly', 'clean_1_weekly',
  'clean_2_monthly', 'clean_2_biweekly', 'clean_2_weekly',
  'clean_3_monthly', 'clean_3_biweekly', 'clean_3_weekly',
  'lawn_1_monthly', 'lawn_1_biweekly', 'lawn_1_weekly',
  'lawn_2_monthly', 'lawn_2_biweekly', 'lawn_2_weekly',
  'lawn_3_monthly', 'lawn_3_biweekly', 'lawn_3_weekly',
  'shine_1', 'shine_2', 'shine_3',
];

describe('1. the 21 lookup keys', () => {
  it('the canon publishes exactly these 21 keys', () => {
    expect([...ALL_RECURRING_LOOKUP_KEYS].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('every cleaning and lawn key is cadence-specific', () => {
    for (const size of [1, 2, 3] as CanonSize[]) {
      for (const cadence of ['monthly', 'biweekly', 'weekly'] as const) {
        expect(SERVICE_LOOKUP_KEYS.cleaning[size][cadence]).toBe(`clean_${size}_${cadence}`);
        expect(SERVICE_LOOKUP_KEYS.lawn[size][cadence]).toBe(`lawn_${size}_${cadence}`);
        // Shine Complete has one plan, so every cadence resolves to one key.
        expect(lookupKeyFor('detailing', size, cadence)).toBe(`shine_${size}`);
      }
    }
  });

  it('both checkout paths resolve Stripe by lookup key, never by a price literal', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      const src = read(p);
      expect(src).toContain('lookup_key');
      expect(src).not.toMatch(/['"]price_[A-Za-z0-9]+['"]/);
    }
  });

  it('the live check exists and fails on any unresolved key', () => {
    const src = read('supabase/functions/verify-checkout-wiring/index.ts');
    expect(src).toContain('all_keys_pass');
    expect(src).toContain('no_archived_selectable');
  });
});

describe('2. cadence is in the price, not the quantity', () => {
  it('every line is quantity 1', () => {
    for (const svc of ['cleaning', 'lawn', 'detailing'] as const) {
      for (const cad of ['monthly', 'biweekly', 'weekly'] as const) {
        expect(quantityFor(svc, cad)).toBe(1);
      }
    }
  });

  it('the billed monthly amount is what the key stands for', () => {
    expect(BILLED_MONTHLY.cleaning[2].biweekly).toBe(348);
    expect(BILLED_MONTHLY.lawn[1].weekly).toBe(180);
  });
});

describe('3. the reference cart — size 2 cleaning, biweekly', () => {
  const state = st({
    services: ['cleaning'],
    frequencies: { cleaning: 'biweekly' },
    bedrooms: '3',
    bathrooms: '2',
  });

  it('translates to one clean_2_biweekly line', () => {
    const { services, car_wash } = translate(state);
    expect(services).toEqual([
      { service: 'cleaning', size: 2, frequency: 'biweekly', sq_ft: null },
    ]);
    expect(car_wash).toBeUndefined();
    expect(lookupKeyFor('cleaning', 2, 'biweekly')).toBe('clean_2_biweekly');
  });

  it('what we display is exactly $348.00 a month', () => {
    expect(Math.round(calculatePricing(state).ongoing * 100)).toBe(34800);
  });
});

describe('4. surcharge bands ride along, oversized properties route to a quote', () => {
  it('2,501-4,000 sq ft cleaning adds $60 a visit', () => {
    const state = st({
      services: ['cleaning'],
      frequencies: { cleaning: 'weekly' },
      bedrooms: '3',
      bathrooms: '2',
      homeSqFt: 3200,
    });
    expect(Math.round(calculatePricing(state).ongoing * 100)).toBe((620 + 240) * 100);
    expect(translate(state).services[0].sq_ft).toBe(3200);
  });

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

describe('5. the standalone Car Wash Add-On is retired', () => {
  it('nothing is ever eligible, and no wash line can be built', () => {
    for (const svc of ['cleaning', 'lawn', 'detailing'] as const) {
      const state = st({
        services: [svc],
        frequencies: { [svc]: 'monthly' },
        bedrooms: svc === 'cleaning' ? '3' : null,
        bathrooms: svc === 'cleaning' ? '2' : null,
        lawnChoice: svc === 'lawn' ? 'standard' : null,
        vehicleClass: 'sedan',
        carWashes: 1,
      });
      expect(carWashEligible(state)).toBe(false);
      expect(translate(state).car_wash).toBeUndefined();
      expect(calculatePricing(state).carWashSubtotal).toBe(0);
    }
  });

  it('the server still refuses a wash without a home service', () => {
    for (const p of [
      'supabase/functions/stripe-create-checkout/index.ts',
      'supabase/functions/create-stripe-payment-intent/index.ts',
    ]) {
      expect(read(p)).toContain('car_wash_requires_home_service');
    }
  });
});

describe('6. the plan snapshot and the founding promise are persisted, not couponed', () => {
  it('checkout writes service, size_tier, cadence and surcharge_applied', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    for (const field of ['size_tier', 'cadence', 'surcharge_applied', 'contractor_pay_cents']) {
      expect(src).toContain(field);
    }
  });

  it('both checkout paths write the founding promises into metadata', () => {
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

  it('no percentage or promo-code machinery reaches Stripe', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    for (const dead of ['TIDY_BUNDLE_', 'percent_off', 'allow_promotion_codes', 'promotion_code']) {
      expect(src).not.toContain(dead);
    }
  });
});
