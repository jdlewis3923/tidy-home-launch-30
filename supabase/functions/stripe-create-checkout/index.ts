// Tidy — Stripe Create Checkout Session
//
// Builds a Stripe Checkout Session from the Tidy configurator state.
//
// Pricing model:
//   - Each selected service maps to ONE recurring Price (subscription line).
//   - XL size upgrades map to a one-time Price added as a separate line item
//     (House: $60, Lawn: $30, Detailing: $30 × vehicleCount).
//   - Each selected add-on maps to a one-time Price (Detailing add-ons × vehicleCount).
//   - Custom Quote tier short-circuits: we refuse to create a session and
//     return 400 so the client can route to the manual quote flow.
//
// Promo codes:
//   - If `promoCode` is supplied AND matches an ACTIVE Stripe promotion code,
//     attach it via `discounts: [{ promotion_code }]`.
//   - Never set `allow_promotion_codes: true` — Stripe's hosted promo input
//     must stay hidden.
//   - Original promo string (valid or not) is recorded on session metadata
//     AND subscription_data.metadata as `referral_promo` for reporting.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

// ---------- Active Stripe Price IDs (26 total) ----------
// Source of truth for what we charge. Keep in sync with active Prices in
// the Stripe dashboard. Deactivated Price IDs MUST NOT appear here.

// 8 recurring subscription prices. Note: NO Car Detailing weekly.
const SERVICE_PRICE: Record<string, string> = {
  'cleaning:monthly':  'price_1T1BxDD7AxvAjJGv03232kHG', // House Cleaning — Monthly $159
  'cleaning:biweekly': 'price_1T1BtVD7AxvAjJGv6DK47KkX', // House Cleaning — Biweekly $275
  'cleaning:weekly':   'price_1TNCl3D7AxvAjJGvV63NNBap', // House Cleaning — Weekly $459
  'lawn:monthly':      'price_1T1C60D7AxvAjJGvHwsiZY3x', // Lawn Care — Monthly $85
  'lawn:biweekly':     'price_1T1C3SD7AxvAjJGv62XM2Bkv', // Lawn Care — Biweekly $129
  'lawn:weekly':       'price_1T1C1vD7AxvAjJGvd2jXDMra', // Lawn Care — Weekly $195
  'detailing:monthly': 'price_1T1CAMD7AxvAjJGv7lPz24fS', // Car Detailing — Monthly $159
  'detailing:biweekly':'price_1T1C8KD7AxvAjJGviNYShuGx', // Car Detailing — Biweekly $249
};

// 3 XL Size Upgrade one-time prices (one per service).
const XL_PRICE: Record<string, string> = {
  cleaning:  'price_1TOXMDD7AxvAjJGvSM51J1SR', // House Cleaning — XL Size Upgrade $60
  lawn:      'price_1TOXMLD7AxvAjJGvLvapXzvK', // Lawn Care — XL Size Upgrade $30
  detailing: 'price_1TOXMSD7AxvAjJGvfA9EueeM', // Car Detailing — XL Size Upgrade $30
};

// 15 add-on one-time prices, keyed by the addOn id used in the configurator.
const ADDON_PRICE: Record<string, string> = {
  // House Cleaning (6)
  oven:            'price_1T1CMdD7AxvAjJGvb2RXCJUg', // Inside Oven Clean $45
  fridge:          'price_1TNCl4D7AxvAjJGvCEEWmMKA', // Inside Fridge Clean $35
  interiorWindows: 'price_1TNCjmD7AxvAjJGvtwYE31nw', // Interior Windows $55
  baseboards:      'price_1TNCjnD7AxvAjJGvAKQN2y7a', // Deep Baseboard Scrub $35
  laundry:         'price_1TNCjpD7AxvAjJGvoZQSrVrh', // Laundry W/D/F (1 load) $30
  cabinets:        'price_1TNCl5D7AxvAjJGvPbjrVube', // Inside Kitchen Cabinets $50

  // Lawn Care (5)
  hedge:           'price_1T1CpMD7AxvAjJGvWqNVcrSi', // Hedge & Bush Trimming $65
  weed:            'price_1TNCl7D7AxvAjJGv3YxUwsUg', // Weed Removal $45
  leaf:            'price_1TNCl9D7AxvAjJGvf7PJ200g', // Leaf & Debris Cleanup $55
  fertilization:   'price_1TNCjqD7AxvAjJGvmWIM5yUB', // Fertilization Treatment $75
  pressureWash:    'price_1TNCjrD7AxvAjJGv3cHMAlq6', // Driveway Pressure Wash $150

  // Car Detailing (4)
  ozone:           'price_1TNCjsD7AxvAjJGviCx7ZE0B', // Ozone Odor Treatment $75
  petHair:         'price_1TNCl6D7AxvAjJGvxirYq3hZ', // Pet Hair Removal $45
  engineBay:       'price_1TNCjuD7AxvAjJGvKKqR021j', // Engine Bay Clean $85
  ceramicSpray:    'price_1TNCjvD7AxvAjJGvQXVMBvpa', // Ceramic Spray Coat $85
};

// Add-ons that are charged per-vehicle (Detailing only).
const PER_VEHICLE_ADDONS = new Set([
  'ozone', 'petHair', 'engineBay', 'ceramicSpray',
]);

type ServiceType = 'cleaning' | 'lawn' | 'detailing';
type Frequency = 'monthly' | 'biweekly' | 'weekly';
type SizeTier = 'standard' | 'xl' | 'custom';

interface ConfigState {
  services: ServiceType[];
  frequencies: Partial<Record<ServiceType, Frequency>>;
  homeSize: SizeTier | null;
  yardSize: SizeTier | null;
  vehicleSize: SizeTier | null;
  vehicleCount: number;
  addOns: string[];
  // (other fields ignored server-side)
}

interface CheckoutBody {
  promoCode?: string;
  config?: ConfigState;
  /** UTM + gclid captured client-side; mirrored onto session metadata. */
  attribution?: Record<string, string>;
}

function tierFor(state: ConfigState, svc: ServiceType): SizeTier | null {
  if (svc === 'cleaning') return state.homeSize;
  if (svc === 'lawn') return state.yardSize;
  return state.vehicleSize;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!STRIPE_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: 'Stripe is not configured (missing STRIPE_SECRET_KEY).' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body: CheckoutBody = {};
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    body = {};
  }

  const config = body.config;
  if (!config || !Array.isArray(config.services) || config.services.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Missing or empty configurator state.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Custom-quote short-circuit. The client should never POST in this case;
  // this is the server-side guard.
  for (const svc of config.services) {
    if (tierFor(config, svc) === 'custom') {
      return new Response(
        JSON.stringify({
          error: 'custom_quote_required',
          message: 'One or more selected services requires a custom quote. Please use the request-a-quote flow.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Build line items.
  // deno-lint-ignore no-explicit-any
  const line_items: any[] = [];
  const vehicleCount = Math.max(1, Number(config.vehicleCount) || 1);

  for (const svc of config.services) {
    const freq = config.frequencies[svc];
    if (!freq) {
      return new Response(
        JSON.stringify({ error: `Missing frequency for service: ${svc}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Guard: Car Detailing has no Weekly Price.
    if (svc === 'detailing' && freq === 'weekly') {
      return new Response(
        JSON.stringify({ error: 'Car Detailing is not available weekly.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const recurringPriceId = SERVICE_PRICE[`${svc}:${freq}`];
    if (!recurringPriceId) {
      return new Response(
        JSON.stringify({ error: `No price configured for ${svc} ${freq}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detailing recurring is per-vehicle.
    const recurringQty = svc === 'detailing' ? vehicleCount : 1;
    line_items.push({ price: recurringPriceId, quantity: recurringQty });

    // XL upgrade as a separate one-time line item if applicable.
    const tier = tierFor(config, svc);
    if (tier === 'xl') {
      const xlPriceId = XL_PRICE[svc];
      const xlQty = svc === 'detailing' ? vehicleCount : 1;
      line_items.push({ price: xlPriceId, quantity: xlQty });
    }
  }

  // Add-ons.
  for (const id of config.addOns ?? []) {
    const priceId = ADDON_PRICE[id];
    if (!priceId) continue; // Unknown add-on id — silently skip.
    const qty = PER_VEHICLE_ADDONS.has(id) ? vehicleCount : 1;
    line_items.push({ price: priceId, quantity: qty });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const promoCode =
    typeof body.promoCode === 'string' && body.promoCode.trim()
      ? body.promoCode.trim().toUpperCase()
      : undefined;

  // Resolve promo code BEFORE building session params so we can attach
  // discounts only when valid. Silent fallback on lookup failure.
  let promoId: string | null = null;
  if (promoCode) {
    try {
      const found = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });
      promoId = found.data[0]?.id ?? null;
    } catch (err) {
      console.error('[stripe-create-checkout] promo lookup failed', err);
      promoId = null;
    }
  }

  const origin = req.headers.get('origin') ?? 'https://jointidy.co';

  // Whitelist + length-clamp attribution params so we don't blow past
  // Stripe's metadata key/value limits or accept arbitrary keys from clients.
  const ATTRIBUTION_KEYS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
  ] as const;
  const safeAttribution: Record<string, string> = {};
  for (const k of ATTRIBUTION_KEYS) {
    const v = body.attribution?.[k];
    if (typeof v === 'string' && v.trim()) {
      safeAttribution[k] = v.trim().slice(0, 500);
    }
  }

  const referralMetadata = {
    source: 'tidy-builder',
    referral_promo: promoCode ?? '',
    ...safeAttribution,
  };

  // deno-lint-ignore no-explicit-any
  const sessionParams: any = {
    mode: 'subscription',
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: promoCode
      ? `${origin}/dashboard/plan?promo=${encodeURIComponent(promoCode)}`
      : `${origin}/checkout/canceled`,
    line_items,
    metadata: referralMetadata,
    subscription_data: {
      metadata: referralMetadata,
    },
  };

  if (promoId) {
    sessionParams.discounts = [{ promotion_code: promoId }];
  }

  try {
    const session = await stripe.checkout.sessions.create(sessionParams);
    return new Response(
      JSON.stringify({ id: session.id, url: session.url }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[stripe-create-checkout] session create failed', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
