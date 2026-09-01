/**
 * Tidy — Stripe Checkout client helper
 *
 * Translates the configurator's ConfigState into the flat payload that
 * `stripe-create-checkout` expects, then invokes the edge function.
 *
 * Each service line carries its SIZE (1/2/3) plus the cadence. The server
 * resolves Stripe by lookup_key and turns cadence into the subscription item
 * quantity (monthly 1, biweekly 2, weekly 4) for per-visit services only;
 * Shine Complete and the Car Wash Add-On are always quantity 1.
 *
 * There are no promo codes: the founding offer is a set of fulfilment promises
 * written onto the subscription row, not a coupon.
 */

import { supabase } from '@/integrations/supabase/client';
import { getUtmAttribution } from '@/lib/utm';
import { getLandingSource, getQrPlacement, getQrRoute, getQrZip } from '@/lib/landing-source';
import { STRIPE_FUNCTIONS } from '@/lib/stripe-config';
import {
  carWashEligible,
  sizeFor,
  sizeForCarCare,
  type ConfigState,
  type Frequency,
  type ServiceType,
} from '@/lib/dashboard-pricing';
import type { CanonSize, WashCount } from '@/lib/pricing-canon';

interface CheckoutPayload {
  config: ConfigState;
  /** Visitor's active locale; defaults to 'en'. */
  lang?: 'en' | 'es';
}

export interface CheckoutServiceLine {
  service: ServiceType;
  size: CanonSize;
  frequency: Frequency;
}

/** Exported for the checkout-parity test: builds the exact server payload. */
export function translate(config: ConfigState) {
  const services = config.services
    .map((svc) => {
      const frequency = config.frequencies[svc] ?? 'monthly';
      const size = sizeFor(config, svc);
      // Above size 3 is a quote — never auto-booked.
      if (!size || size === 'quote') return null;
      return { service: svc, size, frequency } as CheckoutServiceLine;
    })
    .filter((x): x is CheckoutServiceLine => !!x);

  const addons: Array<{ addon_name: string; qty: number }> = (config.addOns ?? []).map((id) => ({
    addon_name: id,
    qty: 1,
  }));

  const vehicleSize = sizeForCarCare(config.vehicleClass);
  const car_wash =
    config.carWashes && carWashEligible(config) && vehicleSize && vehicleSize !== 'quote'
      ? { size: vehicleSize as CanonSize, washes: config.carWashes as WashCount }
      : undefined;

  return { services, addons, car_wash };
}

export async function startCheckout(payload: CheckoutPayload): Promise<void> {
  const attribution = getUtmAttribution();
  const { config, lang } = payload;

  const { services, addons, car_wash } = translate(config);

  const body = {
    services,
    addons,
    car_wash,
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
    // Door-hanger split: /neighbor (English) vs /vecino (Spanish).
    landing_source: getLandingSource() ?? undefined,
    // Placement is separate from source: hero = scanned off the door,
    // card = kept the tear-off and scanned later.
    qr_placement: getQrPlacement() ?? undefined,
    qr_zip: getQrZip() ?? undefined,
    qr_route: getQrRoute() ?? undefined,
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

  window.location.href = data.checkout_url as string;
}

/**
 * Add a service to an existing plan.
 *
 * Goes through the same `stripe-create-checkout` function the initial plan
 * uses — same lookup keys, same cadence-as-quantity rule, same referral and
 * attribution handling. No percentage discounts: bundling stays the free
 * premium add-on, which the webhook records on the subscription row.
 */
export async function startAddServiceCheckout(args: {
  lines: CheckoutServiceLine[];
  zip: string;
  lang?: 'en' | 'es';
}): Promise<void> {
  const attribution = getUtmAttribution();
  const body = {
    services: args.lines,
    addons: [],
    zip: args.zip,
    lang: args.lang ?? ('en' as const),
    gclid: attribution.gclid,
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
    utm_content: attribution.utm_content,
    utm_term: attribution.utm_term,
    landing_source: getLandingSource() ?? undefined,
    qr_placement: getQrPlacement() ?? undefined,
    qr_zip: getQrZip() ?? undefined,
    qr_route: getQrRoute() ?? undefined,
  };

  const { data, error } = await supabase.functions.invoke(
    STRIPE_FUNCTIONS.CREATE_CHECKOUT,
    { body },
  );

  if (error) {
    console.error('[add-service checkout] failed', error);
    throw error;
  }
  if (!data?.ok || !data?.checkout_url) {
    throw new Error(data?.error ?? 'Checkout session did not return a redirect URL');
  }

  window.location.href = data.checkout_url as string;
}
