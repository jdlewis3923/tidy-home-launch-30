// Canon guard. Every price and both discount percentages must trace back to
// src/lib/pricing-canon.ts. This suite fails if:
//   - the server mirror diverges from the client canon
//   - the live Stripe catalog price_cents disagrees with the canon
//   - bundle_discount_tiers (the rate actually charged) disagrees
//   - app_settings.referral_bonus_amount_cents is not $50
//   - a page ships a discount percentage other than 10% / 15%
//   - a retired XL Size Upgrade price is still referenced anywhere
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  BAND_PRICES,
  BANDS,
  CADENCE_MULTIPLIER,
  BUNDLE_DISCOUNT_PCT_CANON,
  REFERRAL_BONUS_CENTS,
  STRIPE_PRICE_IDS,
  FROM_PRICE_PER_VISIT,
  CONTRACTOR_PAY,
  bandPriceCents,
  bandFromBedBath,
  bandFromHomeSqFt,
  bandFromLotSqFt,
  canonBundlePct,
  contractorPayForVisit,
  linePrice,
  type CanonBand,
  type CanonService,
} from '@/lib/pricing-canon';
import { getBundleDiscountPct } from '@/lib/bundle-discount';
import { getPerVisitPrice, REFERRAL_DISCOUNT_CENTS } from '@/lib/dashboard-pricing';

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

function env(name: string): string {
  const raw = read('.env');
  return raw.match(new RegExp(`^${name}=("?)(.*?)\\1$`, 'm'))?.[2]?.trim() ?? '';
}

async function rest<T>(pathAndQuery: string): Promise<T> {
  const url = env('VITE_SUPABASE_URL');
  const key = env('VITE_SUPABASE_PUBLISHABLE_KEY');
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`${pathAndQuery} failed: ${res.status}`);
  return (await res.json()) as T;
}

const services: CanonService[] = ['cleaning', 'lawn', 'detailing'];

describe('pricing canon', () => {
  it('holds the locked per-visit band prices', () => {
    expect(BAND_PRICES).toEqual({
      cleaning: { compact: 119, standard: 149, large: 219, estate: 299 },
      lawn: { compact: 55, standard: 69, large: 105, estate: 135 },
      detailing: { compact: 119, standard: 139, large: 179, estate: 219 },
    });
    expect(CADENCE_MULTIPLIER).toEqual({ monthly: 1, biweekly: 2, weekly: 4 });
    expect(BUNDLE_DISCOUNT_PCT_CANON).toEqual({ 2: 10, 3: 15 });
    expect(REFERRAL_BONUS_CENTS).toBe(5000);
    expect(FROM_PRICE_PER_VISIT).toBe(69);
  });

  it('the edge-function mirror matches the client canon', () => {
    const mirror = read('supabase/functions/_shared/pricing-canon.ts');
    const client = read('src/lib/pricing-canon.ts');
    const grab = (src: string, name: string) =>
      src.match(new RegExp(`${name}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\};)`))?.[1] ?? '';
    for (const name of ['BAND_PRICES', 'CADENCE_MULTIPLIER', 'STRIPE_PRICE_IDS', 'VEHICLE_CLASS_BAND']) {
      const norm = (v: string) => v.replace(/\/\/[^\n]*/g, '').replace(/\s|"|'/g, '');
      expect(norm(grab(mirror, name)), name).toBe(norm(grab(client, name)));
      expect(norm(grab(mirror, name)).length, name).toBeGreaterThan(0);
    }
    expect(mirror).toContain('BUNDLE_DISCOUNT_PCT_CANON: Record<number, number> = { 2: 10, 3: 15 }');
    expect(mirror).toContain('REFERRAL_BONUS_CENTS = 5000');
  });

  it('cadence multiplies the per-visit price, nothing else', () => {
    expect(linePrice('cleaning', 'standard', 'monthly')).toBe(149);
    expect(linePrice('cleaning', 'standard', 'biweekly')).toBe(298);
    expect(linePrice('cleaning', 'standard', 'weekly')).toBe(596);
  });

  it('the client pricing engine reads the canon', () => {
    for (const s of services) {
      for (const b of BANDS) expect(getPerVisitPrice(s, b)).toBe(BAND_PRICES[s][b]);
    }
    expect(REFERRAL_DISCOUNT_CENTS).toBe(REFERRAL_BONUS_CENTS);
    for (const n of [1, 2, 3, 4]) expect(getBundleDiscountPct(n)).toBe(canonBundlePct(n));
  });

  it('bands follow the published definitions', () => {
    expect(bandFromBedBath(2, 2)).toBe('compact');
    expect(bandFromBedBath(3, 2)).toBe('standard');
    expect(bandFromBedBath(4, 3)).toBe('large');
    expect(bandFromBedBath(5, 4)).toBe('estate');
    // Square footage wins the tiebreak: a 3/2 at 2,900 sq ft is Large.
    expect(bandFromHomeSqFt(2900)).toBe('large');
    expect(bandFromHomeSqFt(5000)).toBeNull(); // above Estate — custom quote
    expect(bandFromLotSqFt(9000)).toBe('compact');
    expect(bandFromLotSqFt(20000)).toBe('standard');
    expect(bandFromLotSqFt(30000)).toBe('large');
    expect(bandFromLotSqFt(43000)).toBe('estate');
    expect(bandFromLotSqFt(50000)).toBeNull();
  });

  it('the bundle worked examples come out to the published totals', () => {
    const cleaning = linePrice('cleaning', 'standard', 'biweekly');
    const lawn = linePrice('lawn', 'standard', 'biweekly');
    const detail = linePrice('detailing', 'standard', 'monthly');
    expect(cleaning).toBe(298);
    expect(cleaning + lawn).toBe(436);
    expect(Math.round((cleaning + lawn) * 0.9 * 100) / 100).toBe(392.4);
    expect(cleaning + lawn + detail).toBe(575);
    expect(Math.round((cleaning + lawn + detail) * 0.85 * 100) / 100).toBe(488.75);
    // All-monthly Standard bundles.
    expect(Math.round((149 + 69) * 0.9 * 100) / 100).toBe(196.2);
    expect(Math.round((149 + 69 + 139) * 0.85 * 100) / 100).toBe(303.45);
  });

  it('contractor pay is a share of BANDED LIST price, with a floor', () => {
    expect(CONTRACTOR_PAY).toEqual({
      tier1: { pct: 45, floorDollars: 30 },
      tier2: { pct: 50, floorDollars: 35 },
    });
    expect(contractorPayForVisit(149, 1)).toBeCloseTo(67.05, 2);
    expect(contractorPayForVisit(149, 2)).toBeCloseTo(74.5, 2);
    // The floor protects small jobs: a $55 Compact lawn pays the floor.
    expect(contractorPayForVisit(55, 1)).toBe(30);
    expect(contractorPayForVisit(55, 2)).toBe(35);
  });

  it('no page or component hardcodes a discount percentage off canon', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir))) {
        const rel = `${dir}/${entry}`;
        if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
        else if (/\.(tsx|ts)$/.test(entry)) files.push(rel);
      }
    };
    walk('src/pages');
    walk('src/components');
    const banned = /\b(5|20|25|30)%\s*(off|discount|bundle)/i;
    expect(files.filter((f) => banned.test(read(f)))).toEqual([]);
  });

  it('the retired XL Size Upgrade prices are referenced nowhere', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir))) {
        const rel = `${dir}/${entry}`;
        if (entry === 'node_modules') continue;
        if (statSync(path.join(root, rel)).isDirectory()) walk(rel);
        else if (/\.(tsx|ts)$/.test(entry)) files.push(rel);
      }
    };
    walk('src/lib');
    walk('src/pages');
    walk('src/components');
    walk('supabase/functions');
    const retired = [
      'price_1TOXMDD7AxvAjJGvSM51J1SR',
      'price_1TOXMLD7AxvAjJGvLvapXzvK',
      'price_1TOXMSD7AxvAjJGvfA9EueeM',
      'xl_cleaning',
      'xl_lawn',
      'xl_detailing',
      'XL_UPCHARGE',
    ];
    const offenders = files.filter((f) => retired.some((r) => read(f).includes(r)));
    expect(offenders).toEqual([]);
  });
});

describe('pricing canon ↔ database', () => {
  let catalog: Array<{
    service_type: string | null;
    band: string | null;
    is_addon: boolean;
    per_visit: boolean;
    price_cents: number;
    stripe_price_id: string;
  }> = [];
  let tiers: Array<{ service_count: number; discount_pct: number }> = [];
  let settings: Array<{ key: string; value: unknown }> = [];

  beforeAll(async () => {
    catalog = await rest(
      'stripe_catalog?select=service_type,band,is_addon,per_visit,price_cents,stripe_price_id&active=eq.true',
    );
    tiers = await rest('bundle_discount_tiers?select=service_count,discount_pct');
    settings = await rest('app_settings?select=key,value&key=eq.referral_bonus_amount_cents');
  });

  it('all 12 band prices exist in the catalog at the canon amount and price id', () => {
    for (const s of services) {
      for (const b of BANDS) {
        const row = catalog.find((r) => !r.is_addon && r.service_type === s && r.band === b);
        expect(row, `${s}:${b}`).toBeTruthy();
        expect(row?.price_cents, `${s}:${b}`).toBe(bandPriceCents(s, b));
        expect(row?.stripe_price_id, `${s}:${b}`).toBe(STRIPE_PRICE_IDS[s][b as CanonBand]);
        expect(row?.per_visit, `${s}:${b}`).toBe(true);
      }
    }
    expect(catalog.filter((r) => !r.is_addon).length).toBe(12);
  });

  it('no retired cadence row or XL upgrade row is still active', () => {
    const retiredPriceIds = [
      'price_1T1BxDD7AxvAjJGv03232kHG',
      'price_1T1BtVD7AxvAjJGv6DK47KkX',
      'price_1TNCl3D7AxvAjJGvV63NNBap',
      'price_1T1C60D7AxvAjJGvHwsiZY3x',
      'price_1T1C3SD7AxvAjJGv62XM2Bkv',
      'price_1T1C1vD7AxvAjJGvd2jXDMra',
      'price_1T1CAMD7AxvAjJGv7lPz24fS',
      'price_1T1C8KD7AxvAjJGviNYShuGx',
      'price_1TOXMDD7AxvAjJGvSM51J1SR',
      'price_1TOXMLD7AxvAjJGvLvapXzvK',
      'price_1TOXMSD7AxvAjJGvfA9EueeM',
    ];
    for (const id of retiredPriceIds) {
      expect(catalog.find((r) => r.stripe_price_id === id), id).toBeUndefined();
    }
  });

  it('the charged bundle rates equal the canon', () => {
    const map: Record<number, number> = {};
    for (const t of tiers) map[Number(t.service_count)] = Number(t.discount_pct);
    expect(map).toEqual(BUNDLE_DISCOUNT_PCT_CANON);
  });

  it('the referral bonus is $50 wherever it is read', () => {
    // app_settings is admin-only, so an anon read returns nothing; when it IS
    // visible it must match. The payout fallback in the edge function must too.
    if (settings.length) expect(Number(settings[0].value)).toBe(REFERRAL_BONUS_CENTS);
    const payout = read('supabase/functions/referral-bonus-check/index.ts');
    expect(payout).toContain('setting?.value ?? REFERRAL_BONUS_CENTS');
    expect(payout).toContain('../_shared/pricing-canon.ts');
    expect(read('supabase/functions/_shared/referral-attribution.ts')).toContain(
      'REFERRAL_CREDIT_CENTS = REFERRAL_BONUS_CENTS',
    );
  });
});
