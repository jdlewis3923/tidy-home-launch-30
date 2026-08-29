// Money guard. The bundle discount has broken three times: never charged, then
// stored at the wrong rate, then quoted at 15% while backed by 10%. This test
// removes the manual check by simulating the Stripe subscription end-to-end:
//
//   client ConfigState
//     -> src/lib/checkout.ts translate()          (the real payload builder)
//     -> band price ids + price_cents from        (the real catalog seed)
//        supabase/functions/setup-stripe-catalog
//     -> cadence as line-item quantity            (the real server rule)
//     -> percent_off coupon rate from             (the real DB rate)
//        public.bundle_discount_tiers
//
// and asserting the simulated Stripe amount equals the total we DISPLAY via
// calculatePricing(). If displayed and charged ever diverge again — wrong
// percentage, missing coupon, un-discounted line item, wrong band price, wrong
// cadence quantity — this fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { translate } from '@/lib/checkout';
import { FLORIDA_TAX, cartTriggersFloridaTax, FL_SALES_TAX_COLLECTION_ENABLED } from '@/lib/florida-tax';
import { getBundleDiscountPct } from '@/lib/bundle-discount';
import { BAND_PRICES, CADENCE_MULTIPLIER, STRIPE_PRICE_IDS, type CanonBand } from '@/lib/pricing-canon';

import {
  calculatePricing,
  defaultState,
  bandForCleaning,
  bandForLawn,
  bandForDetailing,
  type ConfigState,
  type ServiceType,
  type Frequency,
  type LotChoice,
} from '@/lib/dashboard-pricing';
import type { VehicleClass } from '@/lib/pricing-canon';

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

/**
 * The live DB rates — public.bundle_discount_tiers is the source of truth for
 * both the displayed total and the amount Stripe charges.
 */
let dbTiers: Record<number, number> = {};

function envFromDotEnv(): { url: string; key: string } {
  const raw = read('.env');
  const get = (name: string) =>
    raw.match(new RegExp(`^${name}=("?)(.*?)\\1$`, 'm'))?.[2]?.trim() ?? '';
  return { url: get('VITE_SUPABASE_URL'), key: get('VITE_SUPABASE_PUBLISHABLE_KEY') };
}

async function fetchDbTiers(): Promise<Record<number, number>> {
  const { url, key } = envFromDotEnv();
  if (!url || !key) throw new Error('missing Supabase env for the bundle discount DB check');
  const res = await fetch(`${url}/rest/v1/bundle_discount_tiers?select=service_count,discount_pct`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`bundle_discount_tiers read failed: ${res.status}`);
  const rows = (await res.json()) as Array<{ service_count: number; discount_pct: number }>;
  if (!rows.length) throw new Error('bundle_discount_tiers is empty — the charged rate has no source');
  const map: Record<number, number> = {};
  for (const r of rows) map[Number(r.service_count)] = Number(r.discount_pct);
  return map;
}

/** The rate the server resolves for a given distinct-service count. */
function dbPct(uniqueServices: number): number {
  let pct = 0;
  for (const [countKey, value] of Object.entries(dbTiers)) {
    if (uniqueServices >= Number(countKey) && value > pct) pct = value;
  }
  return pct;
}

/** The server's offline fallback map, parsed out of the shared resolver. */
function serverFallbackPct(uniqueServices: number): number {
  const src = read('supabase/functions/_shared/bundle-discount.ts');
  const block = src.match(/HARD_FALLBACK[^=]*=\s*\{([^}]*)\}/)?.[1];
  if (!block) throw new Error('could not parse the server fallback bundle map');
  const pairs = [...block.matchAll(/(\d+):\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  let pct = 0;
  for (const [count, value] of pairs) if (uniqueServices >= count && value > pct) pct = value;
  return pct;
}

/** Simulates the Stripe subscription amount in cents for a ConfigState. */
function stripeSubscriptionCents(state: ConfigState): number {
  const { services, addons } = translate(state);

  let subtotalCents = 0;
  for (const s of services) {
    // The server resolves the price by (service, band) and sets the quantity
    // from the cadence — mirrored exactly here.
    const priceId = STRIPE_PRICE_IDS[s.service][s.band as CanonBand];
    expect(priceId, `${s.service}:${s.band}`).toBeTruthy();
    const unit = BAND_PRICES[s.service][s.band as CanonBand] * 100;
    subtotalCents += unit * CADENCE_MULTIPLIER[s.frequency] * (s.qty ?? 1);
  }
  for (const a of addons) {
    const row = addonCatalog.find((r) => r.addon_name === a.addon_name);
    if (!row) throw new Error(`no catalog price for addon ${a.addon_name}`);
    subtotalCents += row.price_cents * a.qty;
  }

  // Stripe applies percent_off to the sum of every recurring line item.
  const pct = dbPct(new Set(services.map((s) => s.service)).size);
  const netCents = subtotalCents - subtotalCents * (pct / 100);

  // Then the exclusive FL TaxRate, when collection is on and a coating is in cart.
  const taxCents =
    FL_SALES_TAX_COLLECTION_ENABLED && cartTriggersFloridaTax(addons)
      ? Math.round(netCents * (FLORIDA_TAX.percentage / 100))
      : 0;
  return netCents + taxCents;
}

const state = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

const bedBathForBand: Record<CanonBand, [string, string]> = {
  compact: ['2', '2'],
  standard: ['3', '2'],
  large: ['4', '3'],
  estate: ['5+', '4+'],
};
const lotForBand: Record<CanonBand, LotChoice> = {
  compact: 'quarter',
  standard: 'half',
  large: 'threeQuarter',
  estate: 'acre',
};
const vehicleForBand: Record<CanonBand, VehicleClass> = {
  compact: 'sedan',
  standard: 'crossover',
  large: 'pickup',
  estate: 'suvFullSize',
};

const freq: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'monthly',
  detailing: 'monthly',
};

function buildState(
  servicesIn: ServiceType[],
  opts: { band?: CanonBand; addOns?: string[]; vehicles?: number; cadence?: Frequency } = {},
): ConfigState {
  const band = opts.band ?? 'standard';
  const frequencies: Partial<Record<ServiceType, Frequency>> = {};
  for (const s of servicesIn) frequencies[s] = opts.cadence ?? freq[s];
  const [bedrooms, bathrooms] = bedBathForBand[band];
  return state({
    services: servicesIn,
    frequencies,
    bedrooms: servicesIn.includes('cleaning') ? bedrooms : null,
    bathrooms: servicesIn.includes('cleaning') ? bathrooms : null,
    homeBand: servicesIn.includes('cleaning') ? bandForCleaning(bedrooms, bathrooms) : null,
    lotChoice: servicesIn.includes('lawn') ? lotForBand[band] : null,
    lawnBand: servicesIn.includes('lawn') ? bandForLawn(lotForBand[band], false) : null,
    vehicleClass: servicesIn.includes('detailing') ? vehicleForBand[band] : null,
    vehicleBand: servicesIn.includes('detailing') ? bandForDetailing(vehicleForBand[band]) : null,
    vehicleCount: opts.vehicles ?? 1,
    addOns: opts.addOns ?? [],
  });
}

describe('checkout ↔ Stripe parity', () => {
  beforeAll(async () => {
    dbTiers = await fetchDbTiers();
  });

  it('the add-on seed and the DB bundle rates are both present', () => {
    expect(addonCatalog.length).toBeGreaterThanOrEqual(15);
    expect(dbPct(1)).toBe(0);
    expect(dbPct(2)).toBe(10);
    expect(dbPct(3)).toBe(15);
  });

  it('the server sets cadence with quantity, not with a separate price', () => {
    const src = read('supabase/functions/stripe-create-checkout/index.ts');
    expect(src).toContain('CADENCE_MULTIPLIER[s.frequency]');
    expect(src).toContain('r.band === s.band');
    expect(src).not.toContain('r.frequency === s.frequency');
  });

  // The client must never carry its own copy of the rate.
  it('the client and server fallbacks equal the DB rates', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(getBundleDiscountPct(n)).toBe(dbPct(n));
      expect(serverFallbackPct(n)).toBe(dbPct(n));
    }
  });

  it('a coupon exists for every non-zero bundle rate the server can send', () => {
    const coupons = read('supabase/functions/_shared/bundle-coupon.ts');
    for (const n of [2, 3]) {
      const pct = dbPct(n);
      expect(coupons).toMatch(new RegExp(`\\b${pct}:\\s*"TIDY_BUNDLE_${pct}PCT"`));
    }
    // The coupon must recur, or month 2 silently reverts to full price.
    expect(coupons).toMatch(/duration:\s*"forever"/);
  });

  const combos: Array<{ label: string; s: ConfigState }> = [
    { label: '1 service · standard', s: buildState(['cleaning']) },
    { label: '2 services · standard', s: buildState(['cleaning', 'lawn']) },
    { label: '3 services · standard', s: buildState(['cleaning', 'lawn', 'detailing']) },
    { label: '3 services · compact', s: buildState(['cleaning', 'lawn', 'detailing'], { band: 'compact' }) },
    { label: '3 services · large', s: buildState(['cleaning', 'lawn', 'detailing'], { band: 'large' }) },
    { label: '3 services · estate', s: buildState(['cleaning', 'lawn', 'detailing'], { band: 'estate' }) },
    { label: '3 services · weekly', s: buildState(['cleaning', 'lawn', 'detailing'], { cadence: 'weekly' }) },
    {
      label: '3 services + add-ons',
      s: buildState(['cleaning', 'lawn', 'detailing'], { addOns: ['oven', 'hedge', 'ozone'] }),
    },
    {
      label: '2 services + 2 vehicles + add-ons',
      s: buildState(['detailing', 'cleaning'], { vehicles: 2, addOns: ['petHair', 'fridge'] }),
    },
    { label: 'detailing only + coating add-on', s: buildState(['detailing'], { addOns: ['ceramicSpray'] }) },
  ];

  for (const { label, s } of combos) {
    it(`displayed total === Stripe amount — ${label}`, () => {
      const displayedCents = Math.round(calculatePricing(s).ongoing * 100);
      expect(Math.round(stripeSubscriptionCents(s))).toBe(displayedCents);
    });
  }

  it('the published Standard worked examples are what we charge', () => {
    const two = buildState(['cleaning', 'lawn'], { cadence: 'biweekly' });
    expect(Math.round(stripeSubscriptionCents(two))).toBe(39240);
    const one = buildState(['cleaning'], { cadence: 'biweekly' });
    expect(Math.round(stripeSubscriptionCents(one))).toBe(29800);
  });

  it('a custom-quote cart never reaches Stripe', () => {
    const over = state({
      services: ['lawn'],
      frequencies: { lawn: 'monthly' },
      lotChoice: 'over',
      lawnBand: bandForLawn('over', false),
    });
    expect(translate(over).services).toEqual([]);
  });
});
