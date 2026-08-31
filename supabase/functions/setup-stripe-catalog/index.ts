// Tidy — One-shot Stripe catalog setup + webhook auto-provisioning
//
// Admin-only. Backfills the 26 live Stripe Price IDs (already created in
// the Stripe dashboard) into stripe_catalog so the rest of the system
// can look up prices via SQL instead of hardcoded maps. Also creates
// (or rotates) the production webhook endpoint pointing at our
// stripe-webhook function and returns the signing secret in the JSON
// response — never logs it.
//
// Idempotent: safe to invoke repeatedly. Catalog rows upsert by
// stripe_price_id. Webhook endpoint with the same URL is deleted +
// recreated to obtain a fresh whsec_ value programmatically (per
// Phase 2 directive — Stripe's API only returns the signing secret
// on creation, not on retrieve).

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';
import { CAR_WASH_LOOKUP_KEYS, CAR_WASH_PRICES, SERVICE_LOOKUP_KEYS, SERVICE_NAMES, SERVICE_QUANTITY_RULE, SERVICE_UNIT, SIZE_PRICES, SIZES, type CanonSize, type CanonService, type WashCount } from '../_shared/pricing-canon.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Webhook endpoint URL — must match the deployed stripe-webhook function.
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/stripe-webhook`;
const WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

// ---------- Live catalog source-of-truth (backfilled, not created) ----------
// Stripe is referenced by lookup_key. Sizes 1/2/3 replace the retired bands and
// the retired XL Size Upgrade prices: size IS a price tier, never a surcharge.
type CatalogRow = {
  service_type: CanonService | null;
  /** Retired: cadence is set with `quantity`, not with the price. */
  frequency: null;
  lookup_key: string | null;
  size: CanonSize | null;
  unit: 'per_visit' | 'per_month' | 'one_time';
  quantity_rule: 'cadence' | 'always_1';
  per_visit: boolean;
  is_addon: boolean;
  addon_name: string | null;
  stripe_price_id: string;
  price_cents: number;
  description: string;
  sort_order: number;
};

const SERVICE_SORT: Record<CanonService, number> = { cleaning: 10, lawn: 20, detailing: 30 };

/** Resolved from Stripe at run time by lookup_key — no price IDs hardcoded. */
type LookupSpec = Omit<CatalogRow, 'stripe_price_id'> & { lookup_key: string };

/** The 9 recurring service prices. */
const SERVICE_SPECS: LookupSpec[] = (['cleaning', 'lawn', 'detailing'] as CanonService[]).flatMap((service) =>
  SIZES.map((size, i) => ({
    service_type: service,
    frequency: null,
    lookup_key: SERVICE_LOOKUP_KEYS[service][size],
    size,
    unit: SERVICE_UNIT[service],
    quantity_rule: SERVICE_QUANTITY_RULE[service],
    per_visit: SERVICE_UNIT[service] === 'per_visit',
    is_addon: false,
    addon_name: null,
    price_cents: SIZE_PRICES[service][size] * 100,
    description: `${SERVICE_NAMES[service]} — size ${size}`,
    sort_order: SERVICE_SORT[service] + i,
  })),
);

/** The 6 recurring Car Wash Add-On prices (per month, always quantity 1). */
const CAR_WASH_SPECS: LookupSpec[] = SIZES.flatMap((size) =>
  ([1, 2] as WashCount[]).map((washes) => ({
    service_type: 'detailing' as CanonService,
    frequency: null,
    lookup_key: CAR_WASH_LOOKUP_KEYS[size][washes],
    size,
    unit: 'per_month' as const,
    quantity_rule: 'always_1' as const,
    per_visit: false,
    is_addon: true,
    addon_name: `carWash${size}x${washes}`,
    price_cents: CAR_WASH_PRICES[size][washes] * 100,
    description: `Car Wash Add-On — size ${size}, ${washes} wash${washes > 1 ? 'es' : ''} a month`,
    sort_order: 40 + size * 2 + washes,
  })),
);

const RECURRING_SPECS: LookupSpec[] = [...SERVICE_SPECS, ...CAR_WASH_SPECS];

const ADDON_ROWS: CatalogRow[] = [


  // ---- 15 add-on one-time prices ----
  // House Cleaning (6)
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'oven', stripe_price_id: 'price_1T1CMdD7AxvAjJGvb2RXCJUg', price_cents: 4500, description: 'Inside Oven Clean', sort_order: 200 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'fridge', stripe_price_id: 'price_1TNCl4D7AxvAjJGvCEEWmMKA', price_cents: 3500, description: 'Inside Fridge Clean', sort_order: 201 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'interiorWindows', stripe_price_id: 'price_1TNCjmD7AxvAjJGvtwYE31nw', price_cents: 5500, description: 'Interior Windows', sort_order: 202 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'baseboards', stripe_price_id: 'price_1TNCjnD7AxvAjJGvAKQN2y7a', price_cents: 3500, description: 'Deep Baseboard Scrub', sort_order: 203 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'laundry', stripe_price_id: 'price_1TNCjpD7AxvAjJGvoZQSrVrh', price_cents: 3000, description: 'Laundry — Wash, Dry & Fold (1 load)', sort_order: 204 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'cabinets', stripe_price_id: 'price_1TNCl5D7AxvAjJGvPbjrVube', price_cents: 5000, description: 'Inside Kitchen Cabinets', sort_order: 205 },
  // Lawn Care (5)
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'weed', stripe_price_id: 'price_1TNCl7D7AxvAjJGv3YxUwsUg', price_cents: 4500, description: 'Weed Removal — Garden Beds', sort_order: 301 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'leaf', stripe_price_id: 'price_1TNCl9D7AxvAjJGvf7PJ200g', price_cents: 5500, description: 'Leaf & Debris Cleanup', sort_order: 302 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'bedEdgeReset', stripe_price_id: 'price_1UAVSJD7AxvAjJGvk6jf0gdG', price_cents: 6500, description: 'Bed Edge Reset', sort_order: 300 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'exteriorWindows', stripe_price_id: 'price_1UAVSJD7AxvAjJGvx0aKd0hF', price_cents: 8500, description: 'Exterior Windows & Screens', sort_order: 303 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'pressureWash', stripe_price_id: 'price_1TNCjrD7AxvAjJGv3cHMAlq6', price_cents: 15000, description: 'Driveway Pressure Wash', sort_order: 304 },
  // Car Detailing (4)
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'ozone', stripe_price_id: 'price_1TNCjsD7AxvAjJGviCx7ZE0B', price_cents: 7500, description: 'Ozone Odor Treatment', sort_order: 400 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'petHair', stripe_price_id: 'price_1TNCl6D7AxvAjJGvxirYq3hZ', price_cents: 4500, description: 'Pet Hair Removal', sort_order: 401 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'engineBay', stripe_price_id: 'price_1TNCjuD7AxvAjJGvKKqR021j', price_cents: 8500, description: 'Engine Bay Clean', sort_order: 402 },
  { service_type: null, frequency: null, lookup_key: null, size: null, unit: 'one_time', quantity_rule: 'always_1', per_visit: false, is_addon: true, addon_name: 'ceramicSpray', stripe_price_id: 'price_1TNCjvD7AxvAjJGvQXVMBvpa', price_cents: 8500, description: 'Ceramic Spray Coat', sort_order: 403 },
];

/** Resolves the 15 recurring prices from Stripe by lookup_key. */
async function resolveRecurringRows(stripe: Stripe): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  for (const spec of RECURRING_SPECS) {
    const found = await stripe.prices.list({ lookup_keys: [spec.lookup_key], active: true, limit: 1 });
    const price = found.data[0];
    if (!price) throw new Error(`Stripe has no active price for lookup_key ${spec.lookup_key}`);
    if ((price.unit_amount ?? 0) !== spec.price_cents) {
      throw new Error(`Stripe price ${spec.lookup_key} is ${price.unit_amount}, canon says ${spec.price_cents}`);
    }
    rows.push({ ...spec, stripe_price_id: price.id });
  }
  return rows;
}

interface SetupResult {
  ok: true;
  catalog_rows_upserted: number;
  webhook: {
    id: string;
    url: string;
    events: readonly string[];
    rotated: boolean;
  };
  /** Returned ONCE here. Paste into Lovable secrets as STRIPE_WEBHOOK_SECRET. */
  webhook_signing_secret: string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ ok: false, error: 'STRIPE_SECRET_KEY missing' }, 500);
  }

  // ---------- Admin authorization ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabaseAuthClient = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabaseAuthClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check admin role server-side (defense in depth — has_role bypasses RLS via SECURITY DEFINER).
  const { data: roleCheck } = await supabase.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin',
  });
  if (roleCheck !== true) {
    return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);
  }

  try {
    const result = await withLogging<SetupResult>({
      source: 'stripe',
      event: 'setup_catalog',
      payload: { caller: userData.user.id },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        // ---------- 1. Backfill catalog ----------
        // Recurring prices come from Stripe by lookup_key; add-ons are one-time
        // price IDs. Upsert by stripe_price_id so reruns are no-ops.
        const catalog: CatalogRow[] = [...(await resolveRecurringRows(stripe)), ...ADDON_ROWS];
        const { error: upsertError } = await supabase
          .from('stripe_catalog')
          .upsert(
            catalog.map((row) => ({ ...row, active: true })),
            { onConflict: 'stripe_price_id' },
          );
        if (upsertError) {
          throw new Error(`catalog upsert failed: ${upsertError.message}`);
        }


        // ---------- 2. Webhook endpoint: delete existing, create fresh ----------
        const existing = await stripe.webhookEndpoints.list({ limit: 100 });
        let rotated = false;
        for (const wh of existing.data) {
          if (wh.url === WEBHOOK_URL) {
            await stripe.webhookEndpoints.del(wh.id);
            rotated = true;
          }
        }

        const created = await stripe.webhookEndpoints.create({
          url: WEBHOOK_URL,
          enabled_events: WEBHOOK_EVENTS as unknown as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
          description: 'Tidy production webhook — auto-created',
          api_version: '2024-12-18.acacia',
        });

        if (!created.secret) {
          throw new Error('Stripe did not return a webhook signing secret');
        }

        return {
          ok: true as const,
          catalog_rows_upserted: catalog.length,
          webhook: {
            id: created.id,
            url: created.url,
            events: WEBHOOK_EVENTS,
            rotated,
          },
          webhook_signing_secret: created.secret,
        };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[setup-stripe-catalog] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
