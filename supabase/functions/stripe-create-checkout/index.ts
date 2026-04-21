// Tidy — Stripe Create Checkout Session
//
// Single backend entry point for creating a Stripe Checkout Session from
// the service builder. Promo-code-aware:
//   - If `promoCode` is provided AND matches an active Stripe promotion code,
//     the discount is pre-applied via `discounts: [{ promotion_code }]`.
//   - Otherwise, `allow_promotion_codes: true` is passed so users can still
//     type a code at Stripe's hosted checkout page.
//   - `discounts` and `allow_promotion_codes` are mutually exclusive — we
//     set exactly one, never both.
//
// All other Checkout Session params (line_items, mode, success_url,
// cancel_url, metadata, customer_creation) are owned by this function and
// safe to extend without re-touching the promo logic.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

interface CheckoutBody {
  promoCode?: string;
  // The configurator state; opaque here. Extend as the builder evolves.
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

  // Base session params. line_items / mode / customer_creation are placeholders
  // and intended to be replaced when the real product/price is connected.
  // Replace `price` below with the actual Stripe Price ID from the configurator
  // before going live.
  // deno-lint-ignore no-explicit-any
  const sessionParams: any = {
    mode: 'subscription',
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout/canceled`,
    customer_creation: 'always',
    line_items: [
      // TODO: replace with real Price ID(s) computed from `body.config`.
      // Kept here so the function is callable end-to-end once a Price exists.
      // Example: { price: 'price_XXX', quantity: 1 }
    ],
    metadata: {
      source: 'tidy-builder',
      ...(promoCode ? { promo_code: promoCode } : {}),
    },
  };

  // === PROMO CODE LOGIC ===
  // discounts and allow_promotion_codes are mutually exclusive.
  if (promoCode) {
    try {
      const found = await stripe.promotionCodes.list({
        code: promoCode,
        active: true,
        limit: 1,
      });
      if (found.data.length > 0) {
        sessionParams.discounts = [{ promotion_code: found.data[0].id }];
      } else {
        // Invalid/expired code — fall back to letting the user retry at Stripe.
        sessionParams.allow_promotion_codes = true;
      }
    } catch (err) {
      console.error('[stripe-create-checkout] promo lookup failed', err);
      sessionParams.allow_promotion_codes = true;
    }
  } else {
    sessionParams.allow_promotion_codes = true;
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
