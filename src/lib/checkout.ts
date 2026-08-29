/**
 * Tidy — Stripe Checkout client helper (Phase 2)
 *
 * Translates the configurator's opaque ConfigState into the flat
 * CheckoutInputSchema shape that `stripe-create-checkout` expects, then
 * invokes the edge function. UI never changes shape — translation is
 * 100% client-side here so neither the dashboard nor the configurator
 * need to know the server contract.
 *
 * Cadence is no longer a price: the band is. Each service line carries its
 * band plus the cadence, and the server turns cadence into the subscription
 * item quantity (monthly 1, biweekly 2, weekly 4).
 */

import { supabase } from '@/integrations/supabase/client';
import { getPromoCode } from '@/lib/promo';
import { getUtmAttribution } from '@/lib/utm';
import { STRIPE_FUNCTIONS } from '@/lib/stripe-config';
import { bandFor, type ConfigState, type Frequency, type ServiceType } from '@/lib/dashboard-pricing';
import type { CanonBand } from '@/lib/pricing-canon';

interface CheckoutPayload {
  config: ConfigState;
  /** Visitor's active locale; defaults to 'en'. */
  lang?: 'en' | 'es';
}

// Add-ons that are billed per-vehicle (Detailing only).
const PER_VEHICLE_ADDONS = new Set(['ozone', 'petHair', 'engineBay', 'ceramicSpray']);

export interface CheckoutServiceLine {
  service: ServiceType;
  band: CanonBand;
  frequency: Frequency;
  /** Units of the property being serviced — vehicles for detailing, else 1. */
  qty: number;
}

/** Exported for the checkout-parity test: builds the exact server payload. */
export function translate(config: ConfigState) {
  const vehicleCount = Math.max(1, Number(config.vehicleCount) || 1);

  const services = config.services
    .map((svc) => {
      const frequency = config.frequencies[svc];
      const band = bandFor(config, svc);
      // Above Estate is a custom quote — never auto-booked.
      if (!frequency || !band || band === 'custom') return null;
      return {
        service: svc,
        band,
        frequency,
        qty: svc === 'detailing' ? vehicleCount : 1,
      } as CheckoutServiceLine;
    })
    .filter((x): x is CheckoutServiceLine => !!x);

  const addons: Array<{ addon_name: string; qty: number }> = (config.addOns ?? []).map((id) => ({
    addon_name: id,
    qty: PER_VEHICLE_ADDONS.has(id) ? vehicleCount : 1,
  }));

  return { services, addons };
}

export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const promo_code = getPromoCode() ?? undefined;
  const attribution = getUtmAttribution();
  const { config, lang } = payload;

  const { services, addons } = translate(config);

  const body = {
    services,
    addons,
    promo_code,
    referral_code: config.referralCode?.trim() || undefined,
    zip: config.zip,
    preferred_day: config.preferredDay,
    preferred_time: config.preferredTime,
    lang: lang ?? ('en' as const),
    gclid: attribution.gclid,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
  };

  const { data, error } = await supabase.functions.invoke(
    STRIPE_FUNCTIONS.CREATE_CHECKOUT,
    { body },
  );

  if (error) {
    console.error('[checkout] failed', error);
    throw error;
  }
  if (!data?.ok || !data?.checkout_url) {
    throw new Error(data?.error ?? 'Checkout session did not return a redirect URL');
  }

  // Promo state is intentionally NOT cleared here — see comment in
  // /checkout/success for the lifecycle.
  window.location.href = data.checkout_url as string;
}
