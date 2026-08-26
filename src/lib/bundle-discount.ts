/**
 * Bundle discount — the DATABASE is the source of truth.
 *
 * Rates live in `public.bundle_discount_tiers` (service_count -> discount_pct).
 * Both sides of the money path read that table:
 *   - display: this module (hydrated at app start by loadBundleDiscountTiers)
 *   - charge:  supabase/functions/stripe-create-checkout + create-stripe-payment-intent
 *
 * The map below is ONLY an offline fallback for the first paint before the
 * fetch resolves. src/test/checkout-stripe-parity.test.ts queries the live
 * table and fails if it ever diverges from this fallback or from the rate the
 * server charges, so the column cannot silently drift again.
 */
import { supabase } from '@/integrations/supabase/client';

/** Offline fallback only — never edit this instead of the DB. */
export const FALLBACK_BUNDLE_DISCOUNT_PCT: Record<number, number> = { 2: 10, 3: 15 };

/** Back-compat alias used by older imports. */
export const BUNDLE_DISCOUNT_PCT = FALLBACK_BUNDLE_DISCOUNT_PCT;

const STORAGE_KEY = 'tidy_bundle_discount_tiers';

function readStored(): Record<number, number> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, number>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const count = Number(k);
      const pct = Number(v);
      if (Number.isFinite(count) && Number.isFinite(pct)) out[count] = pct;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

let tiers: Record<number, number> | null = readStored();

/** Fetches the live tiers from the database and caches them for pricing. */
export async function loadBundleDiscountTiers(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from('bundle_discount_tiers')
    .select('service_count, discount_pct');

  if (error || !data?.length) {
    if (error) console.warn('[bundle-discount] tier read failed; using fallback', error.message);
    return tiers ?? FALLBACK_BUNDLE_DISCOUNT_PCT;
  }

  const next: Record<number, number> = {};
  for (const row of data) next[Number(row.service_count)] = Number(row.discount_pct);
  tiers = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — in-memory cache is enough */
  }
  return next;
}

/**
 * Discount percentage (0–100) for a count of distinct services, taken from the
 * highest tier the customer qualifies for.
 */
export function getBundleDiscountPct(serviceCount: number): number {
  const source = tiers ?? FALLBACK_BUNDLE_DISCOUNT_PCT;
  let pct = 0;
  for (const [countKey, value] of Object.entries(source)) {
    const count = Number(countKey);
    if (serviceCount >= count && value > pct) pct = value;
  }
  return pct;
}
