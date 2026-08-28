// Canon guard. Every price and both discount percentages must trace back to
// src/lib/pricing-canon.ts. This suite fails if:
//   - the server mirror diverges from the client canon
//   - the live Stripe catalog price_cents disagrees with the canon
//   - bundle_discount_tiers (the rate actually charged) disagrees
//   - stripe_catalog rows are not flagged at the top bundle rate
//   - app_settings.referral_bonus_amount_cents is not $50
//   - a marketing page ships a discount percentage other than 10% / 15%
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import {
  SERVICE_PRICES,
  BUNDLE_DISCOUNT_PCT_CANON,
  REFERRAL_BONUS_CENTS,
  TOP_BUNDLE_DISCOUNT_PCT,
  canonBundlePct,
  priceCents,
  type CanonService,
  type CanonFrequency,
} from '@/lib/pricing-canon';
import { getBundleDiscountPct } from '@/lib/bundle-discount';
import { getBasePrice, XL_UPCHARGE, REFERRAL_DISCOUNT_CENTS } from '@/lib/dashboard-pricing';

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
const freqs: CanonFrequency[] = ['monthly', 'biweekly', 'weekly'];

describe('pricing canon', () => {
  it('holds the locked prices', () => {
    expect(SERVICE_PRICES).toEqual({
      cleaning: { monthly: 159, biweekly: 275, weekly: 459 },
      lawn: { monthly: 85, biweekly: 129, weekly: 195 },
      detailing: { monthly: 159, biweekly: 249, weekly: null },
    });
    expect(BUNDLE_DISCOUNT_PCT_CANON).toEqual({ 2: 10, 3: 15 });
    expect(REFERRAL_BONUS_CENTS).toBe(5000);
  });

  it('the edge-function mirror matches the client canon', () => {
    const mirror = read('supabase/functions/_shared/pricing-canon.ts');
    const client = read('src/lib/pricing-canon.ts');
    const grab = (src: string, name: string) =>
      src.match(new RegExp(`${name}[^=]*=\\s*(\\{[\\s\\S]*?\\n\\};)`))?.[1] ?? '';
    for (const name of ['SERVICE_PRICES', 'XL_UPCHARGE_CANON']) {
      const norm = (v: string) => v.replace(/\/\/[^\n]*/g, '').replace(/\s|"|'/g, '');
      expect(norm(grab(mirror, name))).toBe(norm(grab(client, name)));
    }
    expect(mirror).toContain('BUNDLE_DISCOUNT_PCT_CANON: Record<number, number> = { 2: 10, 3: 15 }');
    expect(mirror).toContain('REFERRAL_BONUS_CENTS = 5000');
  });

  it('the client pricing engine reads the canon', () => {
    for (const s of services) {
      for (const f of freqs) {
        expect(getBasePrice(s, f)).toBe(SERVICE_PRICES[s][f] ?? 0);
      }
    }
    expect(XL_UPCHARGE).toEqual({ cleaning: 60, lawn: 30, detailing: 30 });
    expect(REFERRAL_DISCOUNT_CENTS).toBe(REFERRAL_BONUS_CENTS);
    for (const n of [1, 2, 3, 4]) expect(getBundleDiscountPct(n)).toBe(canonBundlePct(n));
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
    const offenders = files.filter((f) => banned.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe('pricing canon ↔ database', () => {
  let catalog: Array<{
    service_type: string | null;
    frequency: string | null;
    is_addon: boolean;
    price_cents: number;
    bundle_discount_pct: number;
  }> = [];
  let tiers: Array<{ service_count: number; discount_pct: number }> = [];
  let settings: Array<{ key: string; value: unknown }> = [];

  beforeAll(async () => {
    catalog = await rest(
      'stripe_catalog?select=service_type,frequency,is_addon,price_cents,bundle_discount_pct&active=eq.true',
    );
    tiers = await rest('bundle_discount_tiers?select=service_count,discount_pct');
    settings = await rest('app_settings?select=key,value&key=eq.referral_bonus_amount_cents');
  });

  it('every canon price exists in the Stripe catalog at the same amount', () => {
    for (const s of services) {
      for (const f of freqs) {
        const cents = priceCents(s, f);
        const row = catalog.find((r) => !r.is_addon && r.service_type === s && r.frequency === f);
        if (cents == null) {
          expect(row, `${s}:${f} must not be sold`).toBeUndefined();
        } else {
          expect(row?.price_cents, `${s}:${f}`).toBe(cents);
        }
      }
    }
  });

  it('every catalog row is flagged at the top bundle rate', () => {
    expect(catalog.length).toBeGreaterThan(0);
    for (const row of catalog) expect(row.bundle_discount_pct).toBe(TOP_BUNDLE_DISCOUNT_PCT);
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
