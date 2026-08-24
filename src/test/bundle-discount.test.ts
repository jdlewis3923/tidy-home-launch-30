// Guards the money path: the total we DISPLAY must equal the total Stripe
// CHARGES. The charge is a percent_off coupon applied to the whole
// subscription, so the displayed figure has to be derived the same way.
import { describe, it, expect } from 'vitest';
import {
  calculatePricing,
  getBundleDiscount,
  defaultState,
  type ConfigState,
} from '@/lib/dashboard-pricing';

/** Mirrors the server rule in stripe-create-checkout / create-stripe-payment-intent. */
function serverBundlePct(uniqueServices: number): number {
  return uniqueServices >= 3 ? 15 : uniqueServices === 2 ? 10 : 0;
}

/** Mirrors Stripe: percent_off applied to the sum of every recurring line item. */
function stripeChargedTotal(subtotal: number, pct: number): number {
  return subtotal - subtotal * (pct / 100);
}

const state = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

describe('bundle discount', () => {
  it('matches canon: 10% for two services, 15% for three', () => {
    expect(getBundleDiscount(1)).toBe(0);
    expect(getBundleDiscount(2)).toBeCloseTo(0.1);
    expect(getBundleDiscount(3)).toBeCloseTo(0.15);
  });

  it('client percentage equals the percentage the server sends to Stripe', () => {
    for (const n of [1, 2, 3]) {
      expect(getBundleDiscount(n) * 100).toBeCloseTo(serverBundlePct(n), 6);
    }
  });

  const cases: Array<{ label: string; s: ConfigState }> = [
    { label: 'one service', s: state({ services: ['cleaning'] }) },
    { label: 'two services', s: state({ services: ['cleaning', 'lawn'] }) },
    { label: 'three services', s: state({ services: ['cleaning', 'lawn', 'detailing'] }) },
  ];

  for (const { label, s } of cases) {
    it(`displayed total equals the Stripe-charged total — ${label}`, () => {
      const p = calculatePricing(s);
      const pct = serverBundlePct(new Set(s.services).size);
      expect(p.firstMonth).toBeCloseTo(stripeChargedTotal(p.subtotal, pct), 6);
      expect(p.ongoing).toBeCloseTo(stripeChargedTotal(p.subtotal, pct), 6);
    });
  }
});
