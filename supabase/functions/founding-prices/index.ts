import '../_shared/http.ts';
// Public, read-only: monthly plan prices for /founding, read from Stripe by lookup_key.
// On any Stripe failure it serves the last cached amounts (stripe_catalog) and logs it.
// Never returns a zero or blank price: a key with no amount is simply omitted.
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { ALL_RECURRING_LOOKUP_KEYS } from '../_shared/pricing-canon.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let memo: { at: number; prices: Record<string, number> } | null = null;

async function fromStripe(): Promise<Record<string, number>> {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('stripe key missing');
  const stripe = new Stripe(key, { apiVersion: '2024-06-20' });
  const out: Record<string, number> = {};
  for (let i = 0; i < ALL_RECURRING_LOOKUP_KEYS.length; i += 10) {
    const r = await stripe.prices.list({ lookup_keys: ALL_RECURRING_LOOKUP_KEYS.slice(i, i + 10), active: true, limit: 10 });
    for (const p of r.data) if (p.lookup_key && p.unit_amount && p.unit_amount > 0) out[p.lookup_key] = p.unit_amount;
  }
  if (Object.keys(out).length < ALL_RECURRING_LOOKUP_KEYS.length) throw new Error(`stripe returned ${Object.keys(out).length}/${ALL_RECURRING_LOOKUP_KEYS.length} prices`);
  return out;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (memo && Date.now() - memo.at < 10 * 60_000) return jsonResponse({ ok: true, source: 'stripe', prices: memo.prices });
  try {
    const prices = await fromStripe();
    memo = { at: Date.now(), prices };
    return jsonResponse({ ok: true, source: 'stripe', prices });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[founding-prices] stripe lookup failed, serving cache', msg);
    await admin.from('integration_logs').insert({ source: 'stripe', event: 'founding_prices.stripe_lookup_failed', status: 'error', error_message: msg }).then(() => {}, () => {});
    const { data } = await admin.from('stripe_catalog').select('lookup_key, price_cents').in('lookup_key', ALL_RECURRING_LOOKUP_KEYS).gt('price_cents', 0);
    const prices: Record<string, number> = {};
    for (const r of data ?? []) if (r.lookup_key) prices[r.lookup_key] = r.price_cents;
    if (memo) Object.assign(prices, memo.prices);
    return jsonResponse({ ok: true, source: 'cache', prices });
  }
});
