// Money guard. The bundle discount has broken twice: once by never being
// charged, once by being stored at the wrong rate. This test removes the need
// for a manual check by simulating the Stripe session end-to-end:
//
//   client ConfigState
//     -> src/lib/checkout.ts translate()          (the real payload builder)
//     -> Stripe Price ids + price_cents from      (the real catalog seed)
//        supabase/functions/setup-stripe-catalog
//     -> percent_off coupon rate parsed out of    (the real server rule)
//        supabase/functions/stripe-create-checkout
//
// and asserting the simulated Stripe session amount equals the total we DISPLAY
// via calculatePricing(). If the displayed total and the charged amount ever
// diverge again — wrong percentage, missing coupon, un-discounted line item —
// this fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { translate } from '@/lib/checkout';
import { getBundleDiscountPct } from '@/lib/bundle-discount';
import {
  calculatePricing,
  defaultState,
  addOnData,
  type ConfigState,
  type ServiceType,
  type Frequency,
} from '@/lib/dashboard-pricing';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

// ---------- The real Stripe catalog (price_cents per price id) ----------
type CatalogRow = {
  service_type: string | null;
  frequency: string | null;
  is_addon: boolean;
  addon_name: string | null;
  price_cents: number;
};

function loadCatalog(): CatalogRow[] {
  const src = read('supabase/functions/setup-stripe-catalog/index.ts');
  const rows: CatalogRow[] = [];
  const re =
    /service_type:\s*(null|'[a-z]+'),\s*frequency:\s*(null|'[a-z]+'),\s*is_addon:\s*(true|false),\s*addon_name:\s*(null|'[A-Za-z_]+'),\s*stripe_price_id:\s*'[^']+',\s*price_cents:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const unquote = (v: string) => (v === 'null' ? null : v.slice(1, -1));
    rows.push({
      service_type: unquote(m[1]),
      frequency: unquote(m[2]),
      is_addon: m[3] === 'true',
      addon_name: unquote(m[4]),
      price_cents: Number(m[5]),
    });
  }
  return rows;
}

const catalog = loadCatalog();

/** The bundle percentage the checkout edge function actually sends to Stripe. */
function serverBundlePct(uniqueServices: number): number {
  const src = read('supabase/functions/stripe-create-checkout/index.ts');
  const pairs = [...src.matchAll(/(\d+):\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2])] as const);
  if (pairs.length < 2) throw new Error('could not parse the bundle discount fallback map');
  const discounts = Object.fromEntries(pairs);
  if (uniqueServices >= 3) return discounts[3] ?? 0;
  if (uniqueServices === 2) return discounts[2] ?? 0;
  return 0;
}

/** Simulates the Stripe session total in cents for a given ConfigState. */
function stripeSessionCents(state: ConfigState): number {
  const { services, addons } = translate(state);

  let subtotalCents = 0;
  for (const s of services) {
    const row = catalog.find(
      (r) => !r.is_addon && r.service_type === s.service && r.frequency === s.frequency,
    );
    if (!row) throw new Error(`no catalog price for ${s.service}:${s.frequency}`);
    subtotalCents += row.price_cents * (s.qty ?? 1);
  }
  for (const a of addons) {
    const row = catalog.find((r) => r.is_addon && r.addon_name === a.addon_name);
    if (!row) throw new Error(`no catalog price for addon ${a.addon_name}`);
    subtotalCents += row.price_cents * a.qty;
  }

  // Stripe applies percent_off to the sum of every recurring line item.
  const pct = serverBundlePct(new Set(services.map((s) => s.service)).size);
  return subtotalCents - subtotalCents * (pct / 100);
}

const state = (over: Partial<ConfigState>): ConfigState => ({ ...defaultState, ...over });

const freq: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn: 'monthly',
  detailing: 'monthly',
};

function buildState(services: ServiceType[], opts: { xl?: boolean; addOns?: string[]; vehicles?: number } = {}) {
  const frequencies: Partial<Record<ServiceType, Frequency>> = {};
  for (const s of services) frequencies[s] = freq[s];
  const tier = opts.xl ? 'xl' : 'standard';
  return state({
    services,
    frequencies,
    homeSize: services.includes('cleaning') ? tier : null,
    yardSize: services.includes('lawn') ? tier : null,
    vehicleSize: services.includes('detailing') ? tier : null,
    vehicleCount: opts.vehicles ?? 1,
    addOns: opts.addOns ?? [],
  });
}

describe('checkout ↔ Stripe parity', () => {
  it('the catalog seed and the coupon rates are both present', () => {
    expect(catalog.filter((r) => !r.is_addon).length).toBeGreaterThanOrEqual(8);
    expect(serverBundlePct(1)).toBe(0);
    expect(serverBundlePct(2)).toBe(10);
    expect(serverBundlePct(3)).toBe(15);
  });

  // The client must never carry its own copy of the rate.
  it('the client bundle rates equal the rates the server charges', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(getBundleDiscountPct(n)).toBe(serverBundlePct(n));
    }
  });

  it('a coupon exists for every non-zero bundle rate the server can send', () => {
    const coupons = read('supabase/functions/_shared/bundle-coupon.ts');
    for (const n of [2, 3]) {
      const pct = serverBundlePct(n);
      expect(coupons).toMatch(new RegExp(`\\b${pct}:\\s*"TIDY_BUNDLE_${pct}PCT"`));
    }
    // The coupon must recur, or month 2 silently reverts to full price.
    expect(coupons).toMatch(/duration:\s*"forever"/);
  });

  const combos: Array<{ label: string; s: ConfigState }> = [
    { label: '1 service', s: buildState(['cleaning']) },
    { label: '2 services', s: buildState(['cleaning', 'lawn']) },
    { label: '3 services', s: buildState(['cleaning', 'lawn', 'detailing']) },
    { label: '3 services + XL everywhere', s: buildState(['cleaning', 'lawn', 'detailing'], { xl: true }) },
    {
      label: '3 services + add-ons',
      s: buildState(['cleaning', 'lawn', 'detailing'], { addOns: ['oven', 'hedge', 'ozone'] }),
    },
    {
      label: '2 services + XL + add-ons + 2 vehicles',
      s: buildState(['detailing', 'cleaning'], { xl: true, vehicles: 2, addOns: ['petHair', 'fridge'] }),
    },
  ];

  for (const { label, s } of combos) {
    it(`displayed total === Stripe session amount — ${label}`, () => {
      const displayedCents = Math.round(calculatePricing(s).ongoing * 100);
      expect(displayedCents).toBe(Math.round(stripeSessionCents(s)));
    });
  }

  it('every configurator add-on has a Stripe price behind it', () => {
    for (const id of Object.keys(addOnData)) {
      expect(catalog.some((r) => r.is_addon && r.addon_name === id)).toBe(true);
    }
  });
});
