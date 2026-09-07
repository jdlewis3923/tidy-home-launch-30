// PRICING CANON GUARD
//
// One source of truth: src/lib/pricing-canon.ts, mirrored byte-for-byte by
// supabase/functions/_shared/pricing-canon.ts. This test fails if the two
// diverge, if a page ships a stale number, or if a retired concept (four size
// bands, percentage bundle discounts, promo codes, cadence-as-quantity) creeps
// back in.
//
// The model: size sets the per-visit price, cadence applies the volume curve
// (monthly x1, biweekly x0.92, weekly x0.82), and the customer is ALWAYS billed
// monthly. Every Stripe price is interval=month at the billed amount, so
// quantity is always 1.
import { GIFT_ELIGIBLE_ADDONS } from '@/lib/addon-catalog';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  ALL_RECURRING_LOOKUP_KEYS,
  BILLED_MONTHLY,
  CADENCE_FACTOR,
  CLEANING_SURCHARGE,
  CONTRACTOR_SHINE_PAY,
  CONTRACTOR_SURCHARGE_PAY,
  CONTRACTOR_VISIT_PAY,
  ENTRY_PRICE_MONTHLY,
  HEADLINE_PRICE_COPY,
  LAWN_SURCHARGE,
  PER_VISIT_PRICES,
  REFERRAL_BONUS_CENTS,
  SERVICE_LOOKUP_KEYS,
  SERVICE_QUANTITY_RULE,
  SERVICE_UNIT,
  SHINE_MONTHLY,
  SIZES,
  SIZE_PRICES,
  TIER_2_UPLIFT,
  VISITS_PER_MONTH,
  FREE_ADDON_CUSTOMER_CHOICE,
  contractorVisitPay,
  freeAddonsPerMonth,
  lookupKeyFor,
  monthlyPrice,
  perVisitPrice,
  quantityFor,
  quarterlyDeepCleanPay,
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

describe('three sizes, per-visit price by cadence', () => {
  it('exposes exactly sizes 1, 2 and 3', () => {
    expect(SIZES).toEqual([1, 2, 3]);
  });

  it('locks the per-visit prices (monthly / biweekly / weekly)', () => {
    expect(PER_VISIT_PRICES.cleaning).toEqual({
      1: { monthly: 139, biweekly: 128, weekly: 114 },
      2: { monthly: 189, biweekly: 174, weekly: 155 },
      3: { monthly: 279, biweekly: 257, weekly: 229 },
    });
    expect(PER_VISIT_PRICES.lawn).toEqual({
      1: { monthly: 45, biweekly: 41, weekly: 37 },
      2: { monthly: 65, biweekly: 60, weekly: 53 },
      3: { monthly: 99, biweekly: 91, weekly: 81 },
    });
  });

  it('locks the billed monthly amounts — the 21 Stripe prices', () => {
    expect(BILLED_MONTHLY.cleaning).toEqual({
      1: { monthly: 139, biweekly: 256, weekly: 456 },
      2: { monthly: 189, biweekly: 348, weekly: 620 },
      3: { monthly: 279, biweekly: 514, weekly: 916 },
    });
    expect(BILLED_MONTHLY.lawn).toEqual({
      1: { monthly: 45, biweekly: 82, weekly: 148 },
      2: { monthly: 65, biweekly: 120, weekly: 212 },
      3: { monthly: 99, biweekly: 182, weekly: 324 },
    });
    expect(SHINE_MONTHLY).toEqual({ 1: 149, 2: 179, 3: 239 });
  });

  it('headline prices are the monthly bill', () => {
    expect(SIZE_PRICES.cleaning).toEqual({ 1: 139, 2: 189, 3: 279 });
    expect(SIZE_PRICES.lawn).toEqual({ 1: 45, 2: 65, 3: 99 });
    expect(SIZE_PRICES.detailing).toEqual({ 1: 149, 2: 179, 3: 239 });
    expect(HEADLINE_PRICE_COPY).toContain('House cleaning from $139 a month');
    expect(HEADLINE_PRICE_COPY).toContain('Lawn care from $45 a month');
    expect(HEADLINE_PRICE_COPY).toContain('Shine Complete from $149 a month');
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

describe('cadence is a volume curve, never a quantity', () => {
  it('biweekly is 8% less per visit, weekly 18% less', () => {
    expect(CADENCE_FACTOR).toEqual({ monthly: 1, biweekly: 0.92, weekly: 0.82 });
  });

  it('visits a month are 1 / 2 / 4', () => {
    expect(VISITS_PER_MONTH).toEqual({ monthly: 1, biweekly: 2, weekly: 4 });
  });

  it('every Stripe line is quantity 1 — the price already carries the cadence', () => {
    for (const svc of ['cleaning', 'lawn', 'detailing'] as CanonService[]) {
      for (const cad of ['monthly', 'biweekly', 'weekly'] as const) {
        expect(quantityFor(svc, cad)).toBe(1);
      }
    }
    expect(SERVICE_QUANTITY_RULE.detailing).toBe('always_1');
  });

  it('the monthly bill is visits x per-visit price', () => {
    expect(monthlyPrice('cleaning', 2, 'biweekly')).toBe(348);
    expect(perVisitPrice('cleaning', 2, 'biweekly') * 2).toBe(348);
    expect(monthlyPrice('lawn', 1, 'weekly')).toBe(148);
    expect(monthlyPrice('detailing', 2, 'weekly')).toBe(179);
  });

  it('surcharges scale with the cadence', () => {
    expect(CLEANING_SURCHARGE.perVisitDollars).toBe(60);
    expect(LAWN_SURCHARGE.perVisitDollars).toBe(30);
    expect(monthlyPrice('cleaning', 2, 'weekly', 60)).toBe(620 + 240);
    expect(monthlyPrice('lawn', 2, 'biweekly', 30)).toBe(120 + 60);
  });
});

describe('contractor pay is 40% of the visit price and never shown to a customer', () => {
  it('locks the cleaning and lawn pay tables', () => {
    expect(CONTRACTOR_VISIT_PAY.cleaning).toEqual({
      1: { monthly: 56, biweekly: 51, weekly: 46 },
      2: { monthly: 76, biweekly: 70, weekly: 62 },
      3: { monthly: 112, biweekly: 103, weekly: 92 },
    });
    expect(CONTRACTOR_VISIT_PAY.lawn).toEqual({
      1: { monthly: 18, biweekly: 16, weekly: 15 },
      2: { monthly: 26, biweekly: 24, weekly: 21 },
      3: { monthly: 40, biweekly: 36, weekly: 32 },
    });
  });

  it('locks Shine pay per wash and per full detail', () => {
    expect(CONTRACTOR_SHINE_PAY[1]).toEqual({ maintenanceWash: 17, fullDetail: 51 });
    expect(CONTRACTOR_SHINE_PAY[2]).toEqual({ maintenanceWash: 20, fullDetail: 61 });
    expect(CONTRACTOR_SHINE_PAY[3]).toEqual({ maintenanceWash: 27, fullDetail: 82 });
  });

  it('surcharge share and Tier 2 uplift', () => {
    expect(CONTRACTOR_SURCHARGE_PAY).toEqual({ cleaning: 24, lawn: 12 });
    expect(TIER_2_UPLIFT).toBe(1.1);
    expect(contractorVisitPay({ service: 'cleaning', size: 2, cadence: 'biweekly' })).toBe(70);
    expect(contractorVisitPay({ service: 'cleaning', size: 2, cadence: 'biweekly', tier: 2 })).toBe(77);
    expect(contractorVisitPay({ service: 'cleaning', size: 2, cadence: 'weekly', surcharge: true })).toBe(62 + 24);
  });

  it('a weekly plan quarterly deep clean pays the MONTHLY rate', () => {
    expect(quarterlyDeepCleanPay(2)).toBe(CONTRACTOR_VISIT_PAY.cleaning[2].monthly);
  });

  it('no percentage share is ever presented in the pay canon', () => {
    const canon = read('src/lib/pricing-canon.ts');
    expect(canon).not.toMatch(/\b45%/);
  });
});

describe('bundling gives one free premium add-on, never a percentage or a wash', () => {
  it('one free add-on at two OR MORE services — there is no third tier', () => {
    expect(freeAddonsPerMonth(0)).toBe(0);
    expect(freeAddonsPerMonth(1)).toBe(0);
    expect(freeAddonsPerMonth(2)).toBe(1);
    expect(freeAddonsPerMonth(3)).toBe(1);
    expect(freeAddonsPerMonth(4)).toBe(1);
  });

  it('the gift pool is the add-on catalogue and the customer chooses', () => {
    expect(FREE_ADDON_CUSTOMER_CHOICE).toBe(true);
    expect(GIFT_ELIGIBLE_ADDONS.length).toBeGreaterThan(0);
    expect(GIFT_ELIGIBLE_ADDONS.some((a) => a.key === 'driveway_pressure')).toBe(false);
    expect(GIFT_ELIGIBLE_ADDONS.every((a) => !a.specialist)).toBe(true);
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
    expect(p.subtotal).toBe(348 + 212);
    expect(p.freeAddons).toBe(1);
  });

  it('no percentage-discount or promo-code machinery survives in the canon', () => {
    const canon = read('src/lib/pricing-canon.ts');
    for (const dead of ['BAND_PRICES', 'bundle_discount_pct', 'TIDY_BUNDLE_', 'promo']) {
      expect(canon).not.toContain(dead);
    }
  });
});

describe('lookup keys are the only way to reach a recurring Stripe price', () => {
  it('publishes exactly 21 cadence-specific keys', () => {
    expect(ALL_RECURRING_LOOKUP_KEYS).toHaveLength(21);
    expect(SERVICE_LOOKUP_KEYS.cleaning[2]).toEqual({
      monthly: 'clean_2_monthly',
      biweekly: 'clean_2_biweekly',
      weekly: 'clean_2_weekly',
    });
    expect(SERVICE_LOOKUP_KEYS.lawn[1].weekly).toBe('lawn_1_weekly');
    expect(lookupKeyFor('detailing', 3, 'weekly')).toBe('shine_3');
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

  it('the entry price is a size 1 lawn, billed monthly', () => {
    expect(ENTRY_PRICE_MONTHLY).toBe(45);
  });
});
