import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Reconcile add-on + car-wash prices with Stripe by lookup_key.
//
// Service-role / admin only. POST { apply?: boolean, probe_checkout?: boolean }.
//  - dry run (default): reports what Stripe holds for every plan, car-wash and
//    add-on lookup_key, including contractor_pay / budget_hours metadata.
//  - apply: attaches the stable lookup_key to each add-on price (transferring
//    it if needed), sets active on/off per spec, writes contractor_pay
//    metadata, re-activates the six Car Wash prices, then mirrors price ids,
//    lookup keys and active flags into stripe_catalog + addon_catalog.
//  - probe_checkout: creates an unpaid Checkout Session for
//    clean_2_biweekly + wash_2_x1, reads amount_total, then expires it.
// Never changes an amount. An amount that disagrees with spec is reported.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { BILLED_MONTHLY, CAR_WASH_LOOKUP_KEYS, CAR_WASH_PRICES, SIZES, lookupKeyFor, type CanonCadence, type CanonService } from '../_shared/pricing-canon.ts';

type AddonSpec = {
  lookup_key: string;
  /** stripe_catalog.addon_name */
  addon_name: string;
  /** addon_catalog.addon_key */
  addon_key: string;
  cents: number;
  active: boolean;
  pay_cents: number | null;
};

const ADDONS: AddonSpec[] = [
  { lookup_key: 'addon_inside_oven', addon_name: 'oven', addon_key: 'inside_oven_clean', cents: 4500, active: true, pay_cents: 1800 },
  { lookup_key: 'addon_inside_fridge', addon_name: 'fridge', addon_key: 'inside_fridge_clean', cents: 3500, active: true, pay_cents: 1400 },
  { lookup_key: 'addon_interior_windows', addon_name: 'interiorWindows', addon_key: 'interior_windows', cents: 5500, active: true, pay_cents: 2200 },
  { lookup_key: 'addon_weed_removal', addon_name: 'weed', addon_key: 'weed_removal', cents: 4500, active: true, pay_cents: 1800 },
  { lookup_key: 'addon_leaf_debris', addon_name: 'leaf', addon_key: 'leaf_debris_cleanup', cents: 5500, active: true, pay_cents: 2200 },
  { lookup_key: 'addon_bed_edge_reset', addon_name: 'bedEdgeReset', addon_key: 'bed_edge_reset', cents: 6500, active: true, pay_cents: 2600 },
  { lookup_key: 'addon_pet_hair', addon_name: 'petHair', addon_key: 'pet_hair_removal', cents: 4500, active: true, pay_cents: 1800 },
  { lookup_key: 'addon_interior_protect', addon_name: 'interiorProtect', addon_key: 'interior_protect_condition', cents: 5500, active: true, pay_cents: 2200 },
  { lookup_key: 'addon_clay_bar_ceramic_coat', addon_name: 'clayBarCeramic', addon_key: 'clay_bar_ceramic_coat', cents: 9500, active: true, pay_cents: 3800 },
  { lookup_key: 'addon_deep_baseboard', addon_name: 'baseboards', addon_key: 'deep_baseboard_scrub', cents: 3500, active: false, pay_cents: null },
  { lookup_key: 'addon_kitchen_cabinets', addon_name: 'cabinets', addon_key: 'inside_kitchen_cabinets', cents: 5000, active: false, pay_cents: null },
  { lookup_key: 'addon_exterior_windows_screens', addon_name: 'exteriorWindows', addon_key: 'exterior_windows_screens', cents: 8500, active: false, pay_cents: null },
  { lookup_key: 'addon_headlight_restoration', addon_name: 'headlightRestoration', addon_key: 'headlight_restoration', cents: 7900, active: false, pay_cents: null },
  { lookup_key: 'addon_driveway_pressure_wash', addon_name: 'pressureWash', addon_key: 'driveway_pressure_wash', cents: 15000, active: false, pay_cents: null },
];

/** Old interior-protect key, superseded by addon_interior_protect. */
/** Pay + hours metadata, spec of 4 Oct 2026. Dollars as strings. */
const PLAN_PAY: Record<string, { pay: number; hours: string }> = {
  clean_1: { pay: 56, hours: '2.20' }, clean_2: { pay: 76, hours: '3.10' }, clean_3: { pay: 112, hours: '4.45' },
  lawn_1: { pay: 18, hours: '0.60' }, lawn_2: { pay: 26, hours: '0.95' }, lawn_3: { pay: 40, hours: '1.50' },
};
const VISITS: Record<string, number> = { monthly: 1, biweekly: 2, weekly: 4 };
const SHINE_MD: Record<string, Record<string, string>> = {
  shine_1: { wash_pay: '16', washes_per_month: '3', detail_pay: '78', details_per_year: '2' },
  shine_2: { wash_pay: '20', washes_per_month: '3', detail_pay: '88', details_per_year: '2' },
  shine_3: { wash_pay: '26', washes_per_month: '3', detail_pay: '115', details_per_year: '2' },
};
const WASH_PAY: Record<string, number> = { wash_1_x1: 16, wash_1_x2: 32, wash_2_x1: 20, wash_2_x2: 40, wash_3_x1: 26, wash_3_x2: 52 };

function planMetadata(key: string): Record<string, string> {
  if (SHINE_MD[key]) return SHINE_MD[key];
  const [svc, size, cadence] = key.split('_');
  const p = PLAN_PAY[`${svc}_${size}`];
  return { contractor_pay_per_visit: String(p.pay), budget_hours_per_visit: p.hours, visits_per_month: String(VISITS[cadence]) };
}

const LEGACY_KEYS: Record<string, string> = { addon_interior_protect: 'addon_interior_protect_condition' };

function planKeys(): { key: string; cents: number }[] {
  const out: { key: string; cents: number }[] = [];
  for (const service of ['cleaning', 'lawn'] as CanonService[]) {
    for (const size of SIZES) {
      for (const c of ['monthly', 'biweekly', 'weekly'] as CanonCadence[]) {
        out.push({ key: lookupKeyFor(service, size, c), cents: BILLED_MONTHLY[service][size][c] * 100 });
      }
    }
  }
  for (const size of SIZES) out.push({ key: lookupKeyFor('detailing', size, 'monthly'), cents: BILLED_MONTHLY.detailing[size].monthly * 100 });
  return out;
}

function washKeys(): { key: string; cents: number }[] {
  const out: { key: string; cents: number }[] = [];
  for (const size of SIZES) for (const n of [1, 2] as const) out.push({ key: CAR_WASH_LOOKUP_KEYS[size][n], cents: CAR_WASH_PRICES[size][n] * 100 });
  return out;
}

async function byKey(stripe: Stripe, key: string): Promise<Stripe.Price | null> {
  // lookup_keys filter returns active and inactive prices alike when active is omitted.
  const r = await stripe.prices.list({ lookup_keys: [key], limit: 1, expand: ['data.product'] });
  return r.data[0] ?? null;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const body = await req.json().catch(() => ({}));
  const testMode = body?.mode === 'test';
  const key = Deno.env.get(testMode ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY');
  if (!key) return jsonResponse({ ok: false, error: 'missing_stripe_key' }, 500);
  const apply = body?.apply === true;
  const probe = body?.probe_checkout === true;

  const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
  const liveKey = Deno.env.get('STRIPE_SECRET_KEY');
  const live = testMode && liveKey ? new Stripe(liveKey, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() }) : null;
  /** Test mode only: create the price by copying the live one (same name, amount, interval, lookup key). */
  async function mirrorFromLive(lookupKey: string): Promise<Stripe.Price | null> {
    if (!live) return null;
    const src = await byKey(live, lookupKey);
    if (!src) return null;
    const lp = src.product as Stripe.Product;
    const product = await stripe.products.create({ name: lp.name, description: lp.description ?? undefined, metadata: lp.metadata });
    const created = await stripe.prices.create({
      product: product.id, currency: src.currency, unit_amount: src.unit_amount ?? 0, lookup_key: lookupKey,
      recurring: src.recurring ? { interval: src.recurring.interval, interval_count: src.recurring.interval_count } : undefined,
      metadata: src.metadata, expand: ['product'],
    });
    return created;
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const mismatches: string[] = [];

  try {
    // ---- Plans: verify only.
    const plans = [];
    for (const p of planKeys()) {
      const price = await byKey(stripe, p.key);
      const want = planMetadata(p.key);
      let md: Record<string, string> = price?.metadata ?? {};
      if (price && apply) {
        const upd = await stripe.prices.update(price.id, { metadata: { ...md, ...want } });
        md = upd.metadata ?? {};
      }
      const row = { key: p.key, expected: p.cents, amount: price?.unit_amount ?? null, active: price?.active ?? false, metadata: Object.fromEntries(Object.keys(want).map((k) => [k, md[k] ?? null])) };
      if (!price) mismatches.push(`${p.key}: not in Stripe`);
      else {
        if (price.unit_amount !== p.cents) mismatches.push(`${p.key}: Stripe ${price.unit_amount} vs list ${p.cents}`);
        if (!price.active) mismatches.push(`${p.key}: switched off in Stripe`);
        for (const [k, v] of Object.entries(want)) if (md[k] !== v) mismatches.push(`${p.key}: metadata ${k}=${md[k] ?? 'missing'} want ${v}`);
      }
      plans.push(row);
    }

    // ---- Car Wash: re-activate.
    const washes = [];
    for (const w of washKeys()) {
      let price = await byKey(stripe, w.key);
      if (!price && testMode && apply) price = await mirrorFromLive(w.key);
      if (!price) { mismatches.push(`${w.key}: not in Stripe`); washes.push({ key: w.key, found: false }); continue; }
      if (price.unit_amount !== w.cents) mismatches.push(`${w.key}: Stripe ${price.unit_amount} vs list ${w.cents}`);
      const product = price.product as Stripe.Product;
      const wasActive = price.active;
      if (apply) {
        if (!product.active) await stripe.products.update(product.id, { active: true });
        await stripe.prices.update(price.id, { active: true, metadata: { ...(price.metadata ?? {}), contractor_pay: String(WASH_PAY[w.key]) } });
        await db.from('stripe_catalog').update(testMode ? { active: true, stripe_price_id_test: price.id } : { active: true, stripe_price_id: price.id }).eq('lookup_key', w.key);
      }
      washes.push({ key: w.key, amount: price.unit_amount, recurring: price.recurring?.interval ?? null, was_active: wasActive, product_was_active: product.active, now_active: apply ? true : wasActive });
    }

    // ---- Add-ons: stable lookup keys + metadata + on/off.
    const { data: catRows } = await db.from('stripe_catalog').select('addon_name, stripe_price_id, lookup_key').eq('is_addon', true);
    const addons = [];
    for (const a of ADDONS) {
      let price = await byKey(stripe, a.lookup_key);
      let source = 'lookup_key';
      if (!price && LEGACY_KEYS[a.lookup_key]) { price = await byKey(stripe, LEGACY_KEYS[a.lookup_key]); source = 'legacy_key'; }
      if (!price && testMode && apply) { price = await mirrorFromLive(a.lookup_key); source = 'created_from_live'; }
      if (!price && !testMode) {
        const id = catRows?.find((r) => r.addon_name === a.addon_name)?.stripe_price_id;
        if (id) { price = await stripe.prices.retrieve(id, { expand: ['product'] }); source = 'catalog_price_id'; }
      }
      if (!price) { mismatches.push(`${a.lookup_key}: no Stripe price found`); addons.push({ key: a.lookup_key, found: false }); continue; }
      if (price.unit_amount !== a.cents) mismatches.push(`${a.lookup_key}: Stripe ${price.unit_amount} vs list ${a.cents}`);
      if (price.type !== 'one_time') mismatches.push(`${a.lookup_key}: Stripe price is ${price.type}, list says one-time`);
      const product = price.product as Stripe.Product;
      if (apply) {
        if (a.active && !product.active) await stripe.products.update(product.id, { active: true });
        const metadata: Record<string, string> = { ...(price.metadata ?? {}), addon_key: a.addon_key };
        if (a.pay_cents != null) metadata.contractor_pay = String(a.pay_cents / 100);
        else delete metadata.contractor_pay;
        await stripe.prices.update(price.id, {
          lookup_key: a.lookup_key, transfer_lookup_key: true, active: a.active, metadata,
        });
        if (testMode) {
          await db.from('stripe_catalog').update({ stripe_price_id_test: price.id }).eq('addon_name', a.addon_name).eq('is_addon', true);
        } else {
          await db.from('stripe_catalog').update({ lookup_key: a.lookup_key, stripe_price_id: price.id, active: a.active }).eq('addon_name', a.addon_name).eq('is_addon', true);
          await db.from('addon_catalog').update({ lookup_key: a.lookup_key, stripe_price_id: price.id, stripe_product_id: product.id }).eq('addon_key', a.addon_key);
        }
      }
      addons.push({ key: a.lookup_key, source, price_id_tail: price.id.slice(-6), amount: price.unit_amount, was_active: price.active, now_active: apply ? a.active : price.active, contractor_pay: apply ? (a.pay_cents == null ? null : a.pay_cents / 100) : (price.metadata?.contractor_pay ?? null) });
    }

    // ---- Checkout probe.
    let checkout: Record<string, any> | null = null;
    if (probe) {
      const plan = await byKey(stripe, 'clean_2_biweekly');
      const wash = await byKey(stripe, 'wash_2_x1');
      if (!plan?.active || !wash?.active) {
        checkout = { ok: false, reason: 'a price is still switched off' };
      } else {
        const s = await stripe.checkout.sessions.create({
          mode: 'subscription',
          line_items: [{ price: plan.id, quantity: 1 }, { price: wash.id, quantity: 1 }],
          success_url: 'https://jointidy.co/checkout/success',
          cancel_url: 'https://jointidy.co/checkout/canceled',
          metadata: { source: 'reconcile_probe' },
        });
        const total = s.amount_total;
        await stripe.checkout.sessions.expire(s.id);
        checkout = { ok: total === 39700, amount_total: total, livemode: s.livemode, expired: true };
        if (testMode) {
          // Test mode: actually complete a car-wash subscription with Stripe's test card, then cancel it.
          const cust = await stripe.customers.create({ email: 'reconcile-probe@jointidy.co', payment_method: 'pm_card_visa', invoice_settings: { default_payment_method: 'pm_card_visa' }, metadata: { source: 'reconcile_probe' } });
          const sub = await stripe.subscriptions.create({ customer: cust.id, items: [{ price: plan.id }, { price: wash.id }] });
          const inv = typeof sub.latest_invoice === 'string' ? await stripe.invoices.retrieve(sub.latest_invoice) : sub.latest_invoice;
          checkout.test_subscription = { status: sub.status, invoice_paid: (inv as Stripe.Invoice)?.status === 'paid', amount_paid: (inv as Stripe.Invoice)?.amount_paid };
          await stripe.subscriptions.cancel(sub.id);
          await stripe.customers.del(cust.id);
        }
      }
    }

    return jsonResponse({ ok: true, mode: testMode ? 'test' : 'live', applied: apply, mismatches, plans, washes, addons, checkout });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message, mismatches }, 500);
  }
});
