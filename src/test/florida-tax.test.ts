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
import { calculatePricing, defaultState, type ConfigState, type ServiceType, type Frequency } from '@/lib/dashboard-pricing';
import { FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';

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
    // Size 2 on every service.
    bedrooms: services.includes('cleaning') ? '3' : null,
    bathrooms: services.includes('cleaning') ? '2' : null,
    lawnChoice: services.includes('lawn') ? 'standard' : null,
    vehicleClass: services.includes('detailing') ? 'crossover' : null,
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

  it('collection is flag-gated and, when on, applies only to detailing line items', () => {
    // Fails closed on a missing/errored app_settings row.
    expect(checkoutSrc).toContain('"fl_sales_tax_enabled"');
    expect(checkoutSrc).toContain('taxFlagRow?.value === true');
    // Only detailing is a taxable service in Florida.
    expect(checkoutSrc).toMatch(/detailingIndices/);
  });

  it('nothing is charged or displayed while collection is disabled', () => {
    // Tidy is not registered to collect FL sales tax: the master switch is off,
    // so the quoted total must carry no tax either.
    expect(FL_SALES_TAX_COLLECTION_ENABLED).toBe(false);
    const p = calculatePricing(buildState(['detailing'], ['ceramicSpray']));
    expect(p.taxAmount).toBe(0);
    expect(p.ongoing).toBeCloseTo(p.netTotal, 2);
    // The rule itself still identifies the coating cart, for when we register.
    expect(taxPctFor(buildState(['detailing'], ['ceramicSpray']))).toBe(7);
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
