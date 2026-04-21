/**
 * Tidy — Stripe Checkout client helper
 *
 * Single client-side entry point for kicking off Stripe Checkout from the
 * builder. Reads the captured promo code from sessionStorage, calls the
 * `stripe-create-checkout` edge function, clears promo state, and redirects.
 */

import { supabase } from '@/integrations/supabase/client';
import { getPromoCode } from '@/lib/promo';
import { STRIPE_FUNCTIONS } from '@/lib/stripe-config';

interface CheckoutPayload {
  // Forward the full configurator state. The edge function builds the
  // line_items / metadata from this — kept opaque here so we don't have
  // to re-edit this helper when the schema changes.
  config: unknown;
}

/**
 * Create a Stripe Checkout Session and redirect the browser to it.
 * Adds the captured promo code (if any) and clears local promo state
 * before redirecting so refresh/back doesn't re-apply it.
 */
export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const promoCode = getPromoCode() ?? undefined;

  const { data, error } = await supabase.functions.invoke(
    STRIPE_FUNCTIONS.CREATE_CHECKOUT,
    {
      body: { ...payload, promoCode },
    }
  );

  if (error) {
    console.error('[checkout] failed', error);
    throw error;
  }
  if (!data?.url) {
    throw new Error('Checkout session did not return a redirect URL');
  }

  // Do NOT clear promo state here — if the user cancels Stripe Checkout
  // and returns via cancel_url, the code must still be in sessionStorage
  // so the banner re-renders and the discount re-applies on retry.
  // Clearing happens only on /checkout/success.
  window.location.href = data.url as string;
}
