// Florida sales tax guard.
//
// The taxability decision lives in the cart, not on the Stripe price objects:
// car detailing becomes taxable at 7% (6% FL state + 1% Miami-Dade surtax) ONLY
// when wax / sealant / ceramic coating is applied, and applying it makes the
// whole transaction taxable. Cleaning (12A-1.0091) and lawn care are never
// taxed. This test asserts all three cases against the real payload builder and
// the real server constant.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import { defaultState, type ConfigState, type ServiceType, type Frequency } from '@/lib/dashboard-pricing';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const taxSrc = read('supabase/functions/_shared/florida-tax.ts');
const checkoutSrc = read('supabase/functions/stripe-create-checkout/index.ts');

/** The rate and coating trigger list, parsed out of the server constant. */
const SERVER_PCT = Number(taxSrc.match(/percentage:\s*([\d.]+)/)?.[1]);
const SERVER_COATING_IDS = [
  ...(taxSrc.match(/coatingAddonIds:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(/"([^"]+)"/g),
].map((m) => m[1]);

/** Mirrors cartTriggersFloridaTax() using the parsed server list. */
function taxPctFor(state: ConfigState): number {
  const { addons } = translate(state);
  return addons.some((a) => SERVER_COATING_IDS.includes(a.addon_name)) ? SERVER_PCT : 0;
}

const freq: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'monthly',
  detailing: 'monthly',
};

function buildState(services: ServiceType[], addOns: string[] = []): ConfigState {
  const frequencies: Partial<Record<ServiceType, Frequency>> = {};
  for (const s of services) frequencies[s] = freq[s];
  return {
    ...defaultState,
    services,
    frequencies,
    homeSize: services.includes('cleaning') ? 'standard' : null,
    yardSize: services.includes('lawn') ? 'standard' : null,
    vehicleSize: services.includes('detailing') ? 'standard' : null,
    vehicleCount: 1,
    addOns,
  };
}

describe('Florida sales tax in checkout', () => {
  it('the rate and trigger list live in one auditable, rule-cited constant', () => {
    expect(SERVER_PCT).toBe(7);
    expect(SERVER_COATING_IDS).toContain('ceramicSpray');
    expect(taxSrc).toMatch(/12A-1\.0091/);
    expect(taxSrc).toMatch(/12A-1\.006\(6\)/);
    // The decision must be cart-level in checkout, never a price tax_behavior.
    expect(checkoutSrc).toContain('cartTriggersFloridaTax');
    expect(checkoutSrc).not.toContain('tax_behavior');
  });

  it('detailing WITH a coating add-on is taxed at 7% on the entire transaction', () => {
    const s = buildState(['detailing'], ['ceramicSpray']);
    expect(taxPctFor(s)).toBe(7);
    // Every line item carries the rate, so the whole charge is taxed.
    expect(checkoutSrc).toMatch(/for \(const li of line_items\) li\.tax_rates = \[taxRateId\]/);
  });

  it('a bundle that includes a coating add-on taxes the whole cart', () => {
    expect(taxPctFor(buildState(['cleaning', 'lawn', 'detailing'], ['ceramicSpray']))).toBe(7);
  });

  it('detailing WITHOUT a coating add-on is untaxed', () => {
    expect(taxPctFor(buildState(['detailing']))).toBe(0);
    expect(taxPctFor(buildState(['detailing'], ['petHair', 'ozone', 'engineBay']))).toBe(0);
  });

  it('house cleaning and lawn care are never taxed', () => {
    expect(taxPctFor(buildState(['cleaning'], ['oven', 'fridge']))).toBe(0);
    expect(taxPctFor(buildState(['lawn'], ['hedge', 'weed']))).toBe(0);
    expect(taxPctFor(buildState(['cleaning', 'lawn']))).toBe(0);
  });
});
