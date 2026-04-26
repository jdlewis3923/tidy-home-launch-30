/**
 * Tidy — Stripe Checkout client helper (Phase 2)
 *
 * Translates the configurator's opaque ConfigState into the flat
 * CheckoutInputSchema shape that `stripe-create-checkout` expects, then
 * invokes the edge function. UI never changes shape — translation is
 * 100% client-side here so neither the dashboard nor the configurator
 * need to know the server contract.
 *
 * Per-vehicle qty rules + XL upgrade flattening are applied here so the
 * server only sees a single uniform addon list with explicit quantities.
 */

import { supabase } from '@/integrations/supabase/client';
import { getPromoCode } from '@/lib/promo';
import { getUtmAttribution } from '@/lib/utm';
import { STRIPE_FUNCTIONS } from '@/lib/stripe-config';
import type { ConfigState, ServiceType } from '@/lib/dashboard-pricing';

interface CheckoutPayload {
  config: ConfigState;
}

// Add-ons that are billed per-vehicle (Detailing only).
const PER_VEHICLE_ADDONS = new Set(['ozone', 'petHair', 'engineBay', 'ceramicSpray']);

/** Map XL flag on a service to the correct catalog addon_name. */
const XL_ADDON_BY_SERVICE: Record<ServiceType, string> = {
  cleaning: 'xl_cleaning',
  lawn: 'xl_lawn',
  detailing: 'xl_detailing',
};

function tierFor(state: ConfigState, svc: ServiceType): string | null {
  if (svc === 'cleaning') return state.homeSize;
  if (svc === 'lawn') return state.yardSize;
  return state.vehicleSize;
}

function translate(config: ConfigState) {
  const vehicleCount = Math.max(1, Number(config.vehicleCount) || 1);

  const services = config.services
    .map((svc) => {
      const frequency = config.frequencies[svc];
      if (!frequency) return null;
      return { service: svc, frequency };
    })
    .filter((x): x is { service: ServiceType; frequency: 'monthly' | 'biweekly' | 'weekly' } => !!x);

  const addons: Array<{ addon_name: string; qty: number }> = [];

  // XL upgrades: convert size tiers into add-on rows (detailing × vehicleCount).
  for (const svc of config.services) {
    if (tierFor(config, svc) === 'xl') {
      addons.push({
        addon_name: XL_ADDON_BY_SERVICE[svc],
        qty: svc === 'detailing' ? vehicleCount : 1,
      });
    }
  }

  // Configurator add-ons.
  for (const id of config.addOns ?? []) {
    addons.push({
      addon_name: id,
      qty: PER_VEHICLE_ADDONS.has(id) ? vehicleCount : 1,
    });
  }

  return { services, addons };
}

export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const promo_code = getPromoCode() ?? undefined;
  const attribution = getUtmAttribution();
  const { config } = payload;

  const { services, addons } = translate(config);

  const body = {
    services,
    addons,
    promo_code,
    zip: config.zip,
    preferred_day: config.preferredDay,
    preferred_time: config.preferredTime,
    lang: 'en' as const,
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
