// Tidy — Stripe Create Checkout Session
//
// Creates a Stripe Checkout Session from the builder. Promo-code-aware:
//   - If `promoCode` is provided AND matches an active Stripe promotion
//     code, apply it via `discounts: [{ promotion_code }]`.
//   - If the code is missing or invalid, silently proceed without a
//     discount. NEVER pass `allow_promotion_codes: true` — per product
//     spec, the ?promo= URL is the only entry point and we do not want
//     Stripe Checkout to render its own promo input field.
//   - The original promo code (whether valid or not) is recorded in
//     metadata on BOTH the Checkout Session and the resulting
//     Subscription (via subscription_data.metadata) for reporting.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface CheckoutBody {
  promoCode?: string;
  // Forwarded configurator state. Opaque here — extend as the builder evolves.
  config?: unknown;
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

  const promoCode =
    typeof body.promoCode === 'string' && body.promoCode.trim()
      ? body.promoCode.trim().toUpperCase()
      : undefined;

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const origin = req.headers.get('origin') ?? 'https://jointidy.co';

  // Look up the promo code (if any) BEFORE building session params so we
  // can attach `discounts` only when valid.
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
      // Silent fallback — never block checkout on a promo lookup error.
      console.error('[stripe-create-checkout] promo lookup failed', err);
      promoId = null;
    }
  }

  const referralMetadata = {
    source: 'tidy-builder',
    referral_promo: promoCode ?? '',
  };

  // deno-lint-ignore no-explicit-any
  const sessionParams: any = {
    mode: 'subscription',
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    // Preserve the promo on cancel so the user lands back in the builder
    // with the discount still attached.
    cancel_url: promoCode
      ? `${origin}/dashboard/plan?promo=${encodeURIComponent(promoCode)}`
      : `${origin}/checkout/canceled`,
    customer_creation: 'always',
    line_items: [
      // TODO: replace with real Price ID(s) computed from `body.config`.
    ],
    metadata: referralMetadata,
    subscription_data: {
      metadata: referralMetadata,
    },
  };

  // Apply the discount ONLY if we resolved a valid promotion code.
  // We deliberately never set `allow_promotion_codes: true` — Stripe's
  // hosted promo input must stay hidden.
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
