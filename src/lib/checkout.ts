/**
 * Tidy — Stripe Checkout client helper
 *
 * Single client-side entry point for kicking off Stripe Checkout from the
 * builder. Reads the captured promo code + UTM/gclid attribution from
 * sessionStorage, calls the `stripe-create-checkout` edge function, and
 * redirects to Stripe.
 */

import { supabase } from '@/integrations/supabase/client';
import { getPromoCode } from '@/lib/promo';
import { getUtmAttribution } from '@/lib/utm';
import { STRIPE_FUNCTIONS } from '@/lib/stripe-config';

interface CheckoutPayload {
  // Forward the full configurator state. The edge function builds the
  // line_items / metadata from this — kept opaque here so we don't have
  // to re-edit this helper when the schema changes.
  config: unknown;
}

export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const promoCode = getPromoCode() ?? undefined;
  const attribution = getUtmAttribution();

  const { data, error } = await supabase.functions.invoke(
    STRIPE_FUNCTIONS.CREATE_CHECKOUT,
    {
      body: { ...payload, promoCode, attribution },
    }
  );

  if (error) {
    console.error('[checkout] failed', error);
    throw error;
  }
  if (!data?.url) {
    throw new Error('Checkout session did not return a redirect URL');
  }

  // Promo state is intentionally NOT cleared here — see comment in
  // /checkout/success for the lifecycle.
  window.location.href = data.url as string;
}
