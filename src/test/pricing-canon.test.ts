// PRICING CANON GUARD
//
// One source of truth: src/lib/pricing-canon.ts, mirrored byte-for-byte by
// supabase/functions/_shared/pricing-canon.ts. This test fails if the two
// diverge, if a page ships a stale number, or if a retired concept (four size
// bands, percentage bundle discounts, promo codes) creeps back in.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  CADENCE_MULTIPLIER,
  CAR_WASH_PRICES,
  ENTRY_PRICE_MONTHLY,
  REFERRAL_BONUS_CENTS,
  SERVICE_LOOKUP_KEYS,
  SERVICE_QUANTITY_RULE,
  SERVICE_UNIT,
  SIZES,
  SIZE_PRICES,
  freeCarWashesPerMonth,
  monthlyPrice,
  quantityFor,
  sizePrice,
  sizePriceCents,
  type CanonService,
} from '@/lib/pricing-canon';
import { calculatePricing, defaultState, getSizePrice } from '@/lib/dashboard-pricing';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

describe('canon is mirrored on the server', () => {
  it('client and server canon are identical apart from the doc header path', () => {
    const client = read('src/lib/pricing-canon.ts');
    const server = read('supabase/functions/_shared/pricing-canon.ts');
    const strip = (s: string) => s.slice(s.indexOf('export type CanonService')).trim();
    expect(strip(server)).toBe(strip(client));
  });
});

describe('three sizes, one flat price each', () => {
  it('exposes exactly sizes 1, 2 and 3', () => {
    expect(SIZES).toEqual([1, 2, 3]);
  });

  it('locks the per-visit and per-month prices', () => {
    expect(SIZE_PRICES.cleaning).toEqual({ 1: 139, 2: 189, 3: 279 });
    expect(SIZE_PRICES.lawn).toEqual({ 1: 45, 2: 65, 3: 99 });
    expect(SIZE_PRICES.detailing).toEqual({ 1: 149, 2: 179, 3: 239 });
  });

  it('locks the car wash add-on prices', () => {
    expect(CAR_WASH_PRICES).toEqual({
      1: { 1: 39, 2: 75 },
      2: { 1: 49, 2: 95 },
      3: { 1: 65, 2: 129 },
    });
  });

  it('prices cleaning and lawn per visit, Shine Complete per month', () => {
    expect(SERVICE_UNIT.cleaning).toBe('per_visit');
    expect(SERVICE_UNIT.lawn).toBe('per_visit');
    expect(SERVICE_UNIT.detailing).toBe('per_month');
  });

  it('cents helper matches the dollar price', () => {
    for (const service of ['cleaning', 'lawn', 'detailing'] as CanonService[]) {
      for (const size of SIZES) {
        expect(sizePriceCents(service, size)).toBe(sizePrice(service, size) * 100);
        expect(getSizePrice(service, size)).toBe(sizePrice(service, size));
      }
    }
  });
});

describe('cadence multiplies, it never discounts', () => {
  it('monthly x1, biweekly x2, weekly x4', () => {
    expect(CADENCE_MULTIPLIER).toEqual({ monthly: 1, biweekly: 2, weekly: 4 });
  });

  it('per-visit services follow cadence; flat monthly services stay at 1', () => {
    expect(SERVICE_QUANTITY_RULE.cleaning).toBe('cadence');
    expect(SERVICE_QUANTITY_RULE.lawn).toBe('cadence');
    expect(SERVICE_QUANTITY_RULE.detailing).toBe('always_1');
    expect(quantityFor('lawn', 'weekly')).toBe(4);
    expect(quantityFor('detailing', 'weekly')).toBe(1);
  });

  it('a weekly lawn costs four times a monthly one — no frequency discount', () => {
    expect(monthlyPrice('lawn', 2, 'weekly')).toBe(sizePrice('lawn', 2) * 4);
    expect(monthlyPrice('detailing', 2, 'weekly')).toBe(sizePrice('detailing', 2));
  });
});

describe('bundling gives car washes, never a percentage', () => {
  it('one free wash at two services, two at three', () => {
    expect(freeCarWashesPerMonth(1)).toBe(0);
    expect(freeCarWashesPerMonth(2)).toBe(1);
    expect(freeCarWashesPerMonth(3)).toBe(2);
  });

  it('calculatePricing applies no discount to the subtotal', () => {
    const p = calculatePricing({
      ...defaultState,
      services: ['cleaning', 'lawn'],
      frequencies: { cleaning: 'biweekly', lawn: 'weekly' },
      bedrooms: '3',
      bathrooms: '2',
      lawnChoice: 'standard',
    });
    expect(p.netTotal).toBe(p.subtotal);
    expect(p.subtotal).toBe(189 * 2 + 65 * 4);
    expect(p.freeCarWashes).toBe(1);
  });

  it('no percentage-discount or promo-code machinery survives in the canon', () => {
    const canon = read('src/lib/pricing-canon.ts');
    for (const dead of ['BAND_PRICES', 'bundle_discount_pct', 'TIDY_BUNDLE_', 'promo']) {
      expect(canon).not.toContain(dead);
    }
  });
});

describe('lookup keys are the only way to reach a recurring Stripe price', () => {
  it('every service/size pair has the expected lookup key', () => {
    expect(SERVICE_LOOKUP_KEYS.cleaning).toEqual({ 1: 'clean_1', 2: 'clean_2', 3: 'clean_3' });
    expect(SERVICE_LOOKUP_KEYS.lawn).toEqual({ 1: 'lawn_1', 2: 'lawn_2', 3: 'lawn_3' });
    expect(SERVICE_LOOKUP_KEYS.detailing).toEqual({ 1: 'shine_1', 2: 'shine_2', 3: 'shine_3' });
  });

  it('checkout never hardcodes a recurring price id', () => {
    const checkout = read('supabase/functions/stripe-create-checkout/index.ts');
    expect(checkout).toContain('lookup_key');
    expect(checkout).not.toMatch(/price_1U9d/); // the archived four-band prices
  });
});

describe('untouched programme rules', () => {
  it('referral is give $50, get $50', () => {
    expect(REFERRAL_BONUS_CENTS).toBe(5000);
  });

  it('the single entry price is a size 1 lawn, biweekly', () => {
    expect(ENTRY_PRICE_MONTHLY).toBe(45 * 2);
  });
});
