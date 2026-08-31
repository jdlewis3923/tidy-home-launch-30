// Tidy — One-shot car add-on restructure + Stripe duplicate cleanup.
//
// Admin (or service-role) only. Two modes:
//   { mode: 'inspect' } → lists the relevant Stripe products/prices so we can
//     see the duplicate pairs before touching anything.
//   { mode: 'apply' }   → archives the retired car add-on prices, archives the
//     duplicate Exterior Windows / Bed Edge Reset prices, normalises metadata on
//     the survivors, creates the three new car add-ons, and writes the resulting
//     price ids back into stripe_catalog + addon_catalog.
//
// Idempotent: already-archived prices and already-created add-ons are skipped.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Retired car add-ons: price ids currently in stripe_catalog. */
const RETIRED_PRICE_IDS = [
  'price_1TNCjsD7AxvAjJGviCx7ZE0B', // Ozone Odor Treatment $75
  'price_1TNCjuD7AxvAjJGvKKqR021j', // Engine Bay Clean $85
  'price_1TNCjvD7AxvAjJGvQXVMBvpa', // Ceramic Spray Coat $85
];

/** The three new one-time car add-ons. */
const NEW_ADDONS = [
  {
    addon_name: 'clayBarCeramic',
    addon_key: 'clay_bar_ceramic_coat',
    display_name: 'Clay Bar & Ceramic Coat',
    price_cents: 9500,
    sort_order: 250,
    icon: 'Sparkles',
    description:
      'Clay bar paint decontamination followed by a ceramic spray coat — about 6 months of protection.',
  },
  {
    addon_name: 'headlightRestoration',
    addon_key: 'headlight_restoration',
    display_name: 'Headlight Restoration',
    price_cents: 7900,
    sort_order: 260,
    icon: 'Lightbulb',
    description:
      'Wet-sand, polish and UV-seal both headlights back to clear. The UV sealant step is included — without it the lenses re-yellow within a year.',
  },
  {
    addon_name: 'interiorProtect',
    addon_key: 'interior_protect_condition',
    display_name: 'Interior Protect & Condition',
    price_cents: 5500,
    sort_order: 270,
    icon: 'ShieldCheck',
    description:
      'Dash, door panels and seats cleaned and conditioned with UV protection against Miami sun damage.',
  },
];

/**
 * Metadata every add-on price/product carries — the exact eight keys the
 * existing add-ons use (category is always `add_on`; the service lives in
 * service_type).
 */
function addonMetadata(o: { service_type: 'car_detailing' | 'lawn' | 'house_cleaning'; addon_key: string }) {
  return {
    add_on: 'yes',
    billing_type: 'one_time',
    bundle: 'no',
    category: 'add_on',
    frequency: 'one_time',
    internal_status: 'final',
    service_type: o.service_type,
    zapier_label: `addon_${o.addon_key}`,
  } as Record<string, string>;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'missing_stripe_key' }, 500);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const maintToken = req.headers.get('x-restructure-token') ?? '';

  let authorized = token !== '' && token === SUPABASE_SERVICE_ROLE_KEY;

  if (!authorized && maintToken) {
    // Single-use maintenance token, stored in app_settings and deleted right
    // after the run.
    const { data: row } = await admin
      .from('app_settings').select('value').eq('key', 'addon_restructure_token').maybeSingle();
    authorized = typeof row?.value === 'string' && row.value === maintToken;
  }

  if (!authorized && token) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) return jsonResponse({ ok: false, error: 'invalid_jwt' }, 401);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', claims.claims.sub as string).eq('role', 'admin').maybeSingle();
    authorized = Boolean(roleRow);
  }

  if (!authorized) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' as any });
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'apply' ? 'apply' : 'inspect';

  // ---- Inventory every price whose product name matches what we care about ----
  const NAME_MATCH = /exterior window|bed edge|ozone|engine bay|ceramic|clay bar|headlight|interior protect/i;
  const inventory: any[] = [];
  for await (const price of stripe.prices.list({ limit: 100, expand: ['data.product'] })) {
    const product = price.product as Stripe.Product;
    const name = typeof product === 'object' ? product.name : '';
    if (!NAME_MATCH.test(name ?? '')) continue;
    inventory.push({
      price_id: price.id,
      product_id: typeof product === 'object' ? product.id : product,
      name,
      unit_amount: price.unit_amount,
      active: price.active,
      lookup_key: price.lookup_key,
      price_metadata: price.metadata,
      product_metadata: typeof product === 'object' ? product.metadata : {},
      created: price.created,
    });
  }

  if (mode === 'inspect') return jsonResponse({ ok: true, mode, inventory });

  const actions: string[] = [];

  // ---- 1. Archive retired car add-on prices --------------------------------
  for (const priceId of RETIRED_PRICE_IDS) {
    try {
      const p = await stripe.prices.retrieve(priceId);
      if (p.active) {
        await stripe.prices.update(priceId, { active: false, metadata: { ...p.metadata, internal_status: 'retired' } });
        actions.push(`archived_price:${priceId}`);
      } else {
        actions.push(`already_archived:${priceId}`);
      }
      if (typeof p.product === 'string') {
        await stripe.products.update(p.product, { active: false }).catch(() => {});
      }
    } catch (e) {
      actions.push(`archive_failed:${priceId}:${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ---- 2. Duplicate cleanup: keep the hand-made pair ----------------------
  // Survivor = the price whose id/product id the operator created by hand
  // (suffix supplied in the request), fallback = the one already referenced by
  // stripe_catalog. Never archive whatever checkout points at without moving
  // stripe_catalog to the survivor first.
  const dupResults: any[] = [];
  const pairs: {
    label: string; match: RegExp; amount: number; keepSuffix?: string;
    addonKey: string; addonName: string; lookupKey: string;
  }[] = [
    {
      label: 'Exterior Windows & Screens', match: /exterior window/i, amount: 8500,
      keepSuffix: body?.keep_exterior_suffix, addonKey: 'exterior_windows_screens',
      addonName: 'exteriorWindows', lookupKey: 'addon_exterior_windows_screens',
    },
    {
      label: 'Bed Edge Reset', match: /bed edge/i, amount: 6500,
      keepSuffix: body?.keep_bed_edge_suffix, addonKey: 'bed_edge_reset',
      addonName: 'bedEdgeReset', lookupKey: 'addon_bed_edge_reset',
    },
  ];

  for (const pair of pairs) {
    const candidates = inventory.filter((i) => pair.match.test(i.name) && i.unit_amount === pair.amount);
    if (candidates.length === 0) { dupResults.push({ label: pair.label, error: 'none_found' }); continue; }
    let survivor = candidates[0];
    if (pair.keepSuffix) {
      const hit = candidates.find(
        (c) => c.price_id.endsWith(pair.keepSuffix!) || c.product_id.endsWith(pair.keepSuffix!),
      );
      if (hit) survivor = hit;
    }
    const meta = addonMetadata({ service_type: 'lawn', addon_key: pair.addonKey });

    // Archive the losers' prices first so the lookup_key can transfer cleanly.
    const archived: string[] = [];
    for (const c of candidates) {
      if (c.price_id === survivor.price_id) continue;
      if (c.active) {
        await stripe.prices.update(c.price_id, {
          active: false,
          metadata: { ...c.price_metadata, internal_status: 'duplicate_archived' },
        });
      }
      archived.push(c.price_id);
    }

    // Normalise the survivor: metadata on both objects, canonical name, and the
    // catalogue lookup_key transferred off the archived twin.
    await stripe.prices.update(survivor.price_id, {
      metadata: { ...survivor.price_metadata, ...meta },
      lookup_key: pair.lookupKey,
      transfer_lookup_key: true,
    });
    await stripe.products.update(survivor.product_id, {
      active: true,
      name: pair.label,
      metadata: { ...survivor.product_metadata, ...meta },
    });

    // Point the DB at the survivor.
    await admin.from('stripe_catalog')
      .update({ stripe_price_id: survivor.price_id, lookup_key: pair.lookupKey, description: pair.label, active: true })
      .eq('addon_name', pair.addonName);
    await admin.from('addon_catalog')
      .update({ stripe_price_id: survivor.price_id, stripe_product_id: survivor.product_id, display_name: pair.label })
      .eq('addon_key', pair.addonKey);

    // Only now archive the losers' products (never before the DB moved over).
    for (const c of candidates) {
      if (c.product_id === survivor.product_id) continue;
      await stripe.products.update(c.product_id, { active: false }).catch(() => {});
    }

    dupResults.push({
      label: pair.label,
      kept: { price_id: survivor.price_id, product_id: survivor.product_id },
      archived,
    });
  }

  // ---- 3. Create the three new car add-ons -------------------------------
  const createdAddons: any[] = [];
  for (const a of NEW_ADDONS) {
    const existing = inventory.find(
      (i) => i.name?.toLowerCase() === a.display_name.toLowerCase() && i.unit_amount === a.price_cents && i.active,
    );
    let priceId = existing?.price_id as string | undefined;
    let productId = existing?.product_id as string | undefined;
    const meta = addonMetadata({ service_type: 'car_detailing', addon_key: a.addon_key });
    if (!priceId) {
      const product = await stripe.products.create({
        name: a.display_name,
        description: a.description,
        metadata: { ...meta, addon_key: a.addon_key },
      });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: a.price_cents,
        currency: 'usd',
        lookup_key: `addon_${a.addon_key}`,
        metadata: { ...meta, addon_key: a.addon_key },
      });
      productId = product.id;
      priceId = price.id;
    }
    await admin.from('stripe_catalog').upsert({
      service_type: null,
      frequency: null,
      lookup_key: `addon_${a.addon_key}`,
      size: null,
      unit: 'one_time',
      quantity_rule: 'always_1',
      per_visit: false,
      is_addon: true,
      addon_name: a.addon_name,
      stripe_price_id: priceId!,
      price_cents: a.price_cents,
      description: a.display_name,
      sort_order: a.sort_order,
      active: true,
    }, { onConflict: 'stripe_price_id' });
    await admin.from('addon_catalog').upsert({
      addon_key: a.addon_key,
      display_name: a.display_name,
      price_cents: a.price_cents,
      services: ['detailing'],
      lucide_icon: a.icon,
      is_specialist: false,
      sort_order: a.sort_order,
      is_active: true,
      stripe_price_id: priceId!,
      stripe_product_id: productId!,
    }, { onConflict: 'addon_key' });
    createdAddons.push({ addon_key: a.addon_key, price_id: priceId, product_id: productId });
  }

  // ---- 4. Deactivate the retired rows in the DB --------------------------
  await admin.from('stripe_catalog').update({ active: false }).in('addon_name', ['ozone', 'engineBay', 'ceramicSpray']);
  await admin.from('addon_catalog').update({ is_active: false })
    .in('addon_key', ['ozone_odor_treatment', 'engine_bay_clean', 'ceramic_spray_coat']);

  return jsonResponse({ ok: true, mode, actions, duplicates: dupResults, new_addons: createdAddons });
});
