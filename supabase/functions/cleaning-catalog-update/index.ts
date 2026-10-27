import '../_shared/http.ts';
import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { CLEANING_SIZES, CADENCES, CLEANING_MONTHLY, CLEANING_BASE_PAY, ESTATE_BUDGET_HOURS, cleaningLookupKey, cleaningAnnualCents } from '../_shared/pricing-canon.ts';

// Additive, lookup-key driven provisioning. Never changes subscriptions, rotates
// webhooks, exposes credentials, or alters existing price amounts/activation.
Deno.serve(async req => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === 'test' ? 'test' : 'live';
  const key = Deno.env.get(mode === 'test' ? 'STRIPE_TEST_SECRET_KEY' : 'STRIPE_SECRET_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !url || !serviceKey) return jsonResponse({ ok: false, mode, error: 'configuration_missing' }, 503);
  const stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia', httpClient: Stripe.createFetchHttpClient() });
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const apply = body.apply === true;
  const results = [];
  try {
    const account = await stripe.balance.retrieve();
    if (account.livemode !== (mode === 'live')) throw new Error('stripe_mode_mismatch');
    for (const size of CLEANING_SIZES) for (const cadence of CADENCES) for (const yearly of [false, true]) {
      // Existing Sizes 1–3 monthly prices are read-only; add their annual twins.
      const lookup = cleaningLookupKey(size, cadence, yearly);
      const amount = yearly ? cleaningAnnualCents(size, cadence) : CLEANING_MONTHLY[size][cadence] * 100;
      const found = await stripe.prices.list({ lookup_keys: [lookup], limit: 1 });
      let price = found.data[0];
      const interval = yearly ? 'year' : 'month';
      if (price && (price.unit_amount !== amount || price.currency !== 'usd' || price.recurring?.interval !== interval || !price.active)) throw new Error(`existing_price_mismatch:${lookup}`);
      const metadata = { service_type: 'cleaning', size_tier: String(size), cadence, rate_card_version: '1', canon_key: lookup,
        billing_period: yearly ? 'yearly' : 'monthly', contractor_pay: String(CLEANING_BASE_PAY[size]),
        ...(size >= 4 ? { budget_hours: String(ESTATE_BUDGET_HOURS[size as 4 | 5]), team_required: size === 5 ? 'true' : 'false' } : {}) };
      if (!price && apply) {
        const anchorKey = cleaningLookupKey(size <= 3 ? size : 3, 'monthly');
        const anchor = await stripe.prices.list({ lookup_keys: [anchorKey], limit: 1 });
        const anchorPrice = anchor.data[0];
        if (!anchorPrice) throw new Error(`missing_cleaning_product:${anchorKey}`);
        const product = typeof anchorPrice.product === 'string' ? anchorPrice.product : anchorPrice.product.id;
        price = await stripe.prices.create({ product, lookup_key: lookup, currency: 'usd', unit_amount: amount, recurring: { interval }, metadata,
          nickname: `Cleaning ${size === 4 ? 'Estate' : size === 5 ? 'Estate Plus' : `Size ${size}`} · ${cadence} · ${yearly ? 'yearly' : 'monthly'}` }, { idempotencyKey: `tidy-cleaning-v1:${mode}:${lookup}` });
      }
      if (price && apply && size >= 4) price = await stripe.prices.update(price.id, { metadata });
      if (price && apply) {
        const { data: existing, error: readError } = await db.from('stripe_catalog').select('id,stripe_price_id').eq('canon_key', lookup).eq('rate_card_version', 1).maybeSingle();
        if (readError) throw new Error(readError.message);
        const values = { service_type: 'cleaning', frequency: null, is_addon: false, canon_key: lookup, lookup_key: lookup,
          cleaning_size: size, size: size <= 3 ? size : null, billing_period: yearly ? 'yearly' : 'monthly', price_cents: amount,
          rate_card_version: 1, unit: 'per_month', quantity_rule: 'always_1', per_visit: false, active: true,
          description: `Cleaning · ${size === 4 ? 'Estate' : size === 5 ? 'Estate Plus' : `Size ${size}`} · ${cadence}${yearly ? ' · annual' : ''}`,
          [mode === 'test' ? 'stripe_price_id_test' : 'stripe_price_id']: price.id };
        if (!existing && mode === 'test') {
          // Do not fabricate live IDs. Live provisioning creates the row first.
          results.push({ lookup_key: lookup, amount_cents: amount, exists: true, catalog_pending_live: true });
          continue;
        }
        const write = existing ? db.from('stripe_catalog').update(values).eq('id', existing.id) : db.from('stripe_catalog').insert(values);
        const { error } = await write;
        if (error) throw new Error(`catalog_write:${lookup}:${error.message}`);
      }
      results.push({ lookup_key: lookup, amount_cents: amount, exists: !!price, applied: apply, interval });
    }
    // Audit every existing add-on rather than quietly guessing missing keys.
    const { data: addons, error } = await db.from('stripe_catalog').select('id,addon_name,lookup_key,active').eq('is_addon', true);
    if (error) throw new Error(error.message);
    const missingKeys = (addons ?? []).filter(a => a.active && !a.lookup_key).map(a => ({ addon_name: a.addon_name, reason: 'lookup_key_missing' }));
    return jsonResponse({ ok: results.every(r => r.exists) && missingKeys.length === 0, mode, apply, results, addon_lookup_gaps: missingKeys });
  } catch (e) {
    return jsonResponse({ ok: false, mode, results, error: e instanceof Error ? e.message : 'catalog_update_failed' }, 500);
  }
});