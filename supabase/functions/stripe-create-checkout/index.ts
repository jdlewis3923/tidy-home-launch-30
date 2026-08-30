// Tidy — Stripe Create Checkout Session
//
// Reads the flat CheckoutInputSchema from the client (translation lives in
// src/lib/checkout.ts), resolves Stripe prices from stripe_catalog BY LOOKUP KEY,
// builds line_items, and creates a subscription-mode Checkout Session.
//
// Model: three sizes (1/2/3) per service. Cleaning and lawn are per visit and
// carry cadence as the item quantity (monthly 1, biweekly 2, weekly 4). Shine
// Complete and the Car Wash Add-On are per month, always quantity 1.
//
// There is NO percentage discount and NO promo code. Bundling earns free car
// washes, and the founding offer is a set of fulfilment promises recorded in
// subscription metadata (the webhook writes them onto the subscription row).

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { withLogging } from "../_shared/withLogging.ts";
import { recordReferralAttribution } from "../_shared/referral-attribution.ts";
import {
  CAR_WASH_LOOKUP_KEYS,
  SERVICE_LOOKUP_KEYS,
  freeCarWashesPerMonth,
  quantityFor,
  type CanonSize,
  type WashCount,
} from "../_shared/pricing-canon.ts";
import { FLORIDA_TAX, cartTriggersFloridaTax, getFloridaTaxRateId } from "../_shared/florida-tax.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://jointidy.co";

// Service-area ZIPs. Anything else gets a waitlist, never a checkout.
const SERVICE_ZIPS = new Set(["33156", "33183", "33186"]);

const ServiceTypeEnum = z.enum(["cleaning", "lawn", "detailing"]);
const FrequencyEnum = z.enum(["monthly", "biweekly", "weekly"]);
const SizeEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const CheckoutInputSchema = z.object({
  services: z
    .array(
      z.object({
        service: ServiceTypeEnum,
        size: SizeEnum,
        frequency: FrequencyEnum,
      }),
    )
    .min(1)
    .max(3),
  addons: z
    .array(z.object({ addon_name: z.string().min(1).max(64), qty: z.number().int().min(1).max(20) }))
    .max(50)
    .default([]),
  car_wash: z
    .object({ size: SizeEnum, washes: z.union([z.literal(1), z.literal(2)]) })
    .optional(),
  referral_code: z.string().trim().min(1).max(64).optional(),
  zip: z.string().regex(/^\d{5}$/),
  preferred_day: z.string().max(20).optional(),
  preferred_time: z.string().max(20).optional(),
  lang: z.enum(["en", "es"]).default("en"),
  // Attribution
  gclid: z.string().max(500).optional(),
  utm_source: z.string().max(500).optional(),
  utm_medium: z.string().max(500).optional(),
  utm_campaign: z.string().max(500).optional(),
  utm_content: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ ok: false, error: "Stripe not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  const user = userData.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const parsed = CheckoutInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "validation_failed", details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  if (!SERVICE_ZIPS.has(input.zip)) {
    return jsonResponse({ ok: false, error: "zip_outside_service_area" }, 400);
  }

  // The Car Wash Add-On requires an active lawn or cleaning plan.
  const hasHomeService = input.services.some((s) => s.service === "lawn" || s.service === "cleaning");
  if (input.car_wash && !hasHomeService) {
    return jsonResponse({ ok: false, error: "car_wash_requires_home_service" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: "stripe",
      event: "checkout.session.create",
      payload: {
        user_id: user.id,
        services: input.services.map((s) => `${s.service}:${s.size}:${s.frequency}`),
      },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2024-12-18.acacia",
          httpClient: Stripe.createFetchHttpClient(),
        });

        // ---------- Resolve recurring prices by lookup key ----------
        const serviceKeys = input.services.map((s) => SERVICE_LOOKUP_KEYS[s.service][s.size as CanonSize]);
        const carWashKey = input.car_wash
          ? CAR_WASH_LOOKUP_KEYS[input.car_wash.size as CanonSize][input.car_wash.washes as WashCount]
          : null;

        const { data: priceRows, error: priceErr } = await supabase
          .from("stripe_catalog")
          .select("lookup_key, service_type, stripe_price_id")
          .in("lookup_key", carWashKey ? [...serviceKeys, carWashKey] : serviceKeys)
          .eq("active", true);
        if (priceErr) throw new Error(`catalog read failed: ${priceErr.message}`);

        // deno-lint-ignore no-explicit-any
        const line_items: any[] = [];
        // Only car-care line items can ever carry Florida sales tax; residential
        // cleaning and lawn care are nontaxable services in Florida.
        const carCareIndices = new Set<number>();

        for (const s of input.services) {
          const key = SERVICE_LOOKUP_KEYS[s.service][s.size as CanonSize];
          const row = priceRows?.find((r) => r.lookup_key === key);
          if (!row) throw new Error(`no active catalog price for lookup_key ${key}`);
          if (s.service === "detailing") carCareIndices.add(line_items.length);
          line_items.push({ price: row.stripe_price_id, quantity: quantityFor(s.service, s.frequency) });
        }

        if (carWashKey) {
          const row = priceRows?.find((r) => r.lookup_key === carWashKey);
          if (!row) throw new Error(`no active catalog price for lookup_key ${carWashKey}`);
          carCareIndices.add(line_items.length);
          line_items.push({ price: row.stripe_price_id, quantity: 1 });
        }

        // ---------- Resolve one-time add-on prices ----------
        if (input.addons.length > 0) {
          const { data: addonRows, error: addonErr } = await supabase
            .from("stripe_catalog")
            .select("addon_name, service_type, stripe_price_id")
            .eq("is_addon", true)
            .eq("active", true)
            .in(
              "addon_name",
              input.addons.map((a) => a.addon_name),
            );
          if (addonErr) throw new Error(`addon catalog read failed: ${addonErr.message}`);

          for (const a of input.addons) {
            const row = addonRows?.find((r) => r.addon_name === a.addon_name);
            if (!row) continue; // unknown add-on — skip silently
            if (row.service_type === "detailing") carCareIndices.add(line_items.length);
            line_items.push({ price: row.stripe_price_id, quantity: a.qty });
          }
        }

        // ---------- Florida sales tax (see _shared/florida-tax.ts) ----------
        // GATED OFF: Tidy Home Concierge LLC holds no Florida Certificate of
        // Registration, so no sales tax may be collected. `fl_sales_tax_enabled`
        // (default false) is the switch and a missing/errored row fails closed.
        const { data: taxFlagRow } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "fl_sales_tax_enabled")
          .maybeSingle();
        const taxCollectionEnabled = taxFlagRow?.value === true;

        const taxable = taxCollectionEnabled && cartTriggersFloridaTax(input.addons);
        let taxRateId: string | null = null;
        if (taxable) {
          taxRateId = await getFloridaTaxRateId(stripe);
          for (const idx of carCareIndices) line_items[idx].tax_rates = [taxRateId];
        }

        // ---------- Bundle gift: free car washes, never a percentage ----------
        const uniqueServices = new Set(input.services.map((s) => s.service)).size;
        const freeCarWashes = freeCarWashesPerMonth(uniqueServices);

        // ---------- Subscription metadata for the webhook ----------
        const subscriptionMetadata: Record<string, string> = {
          cohort: "founding_2026",
          signed_up_at: new Date().toISOString(),
          user_id: user.id,
          services_json: JSON.stringify(input.services),
          sizes_json: JSON.stringify(Object.fromEntries(input.services.map((s) => [s.service, s.size]))),
          addons_json: JSON.stringify(input.addons),
          car_wash_json: input.car_wash ? JSON.stringify(input.car_wash) : "",
          free_car_washes_per_month: String(freeCarWashes),
          zip: input.zip,
          preferred_day: input.preferred_day ?? "",
          preferred_time: input.preferred_time ?? "",
          lang: input.lang,
          // Founding offer — fulfilment promises, not coupons.
          founding_rate_locked: "yes",
          founding_free_addon_first_visit: "yes",
          founding_review_promised: "yes",
          fl_tax_applied: taxable ? "yes" : "no",
          fl_tax_pct: taxable ? String(FLORIDA_TAX.percentage) : "0",
          fl_tax_rate_id: taxRateId ?? "",
          gclid: input.gclid ?? "",
          utm_source: input.utm_source ?? "",
          utm_medium: input.utm_medium ?? "",
          utm_campaign: input.utm_campaign ?? "",
          utm_content: input.utm_content ?? "",
          utm_term: input.utm_term ?? "",
        };

        // deno-lint-ignore no-explicit-any
        const sessionParams: any = {
          mode: "subscription",
          customer_email: user.email ?? undefined,
          client_reference_id: user.id,
          line_items,
          metadata: subscriptionMetadata,
          subscription_data: { metadata: subscriptionMetadata },
          success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SITE_URL}/checkout/canceled`,
        };

        const session = await stripe.checkout.sessions.create(sessionParams);

        // Referral attribution (pending row; payout happens on first paid invoice).
        await recordReferralAttribution({
          supabase,
          stripe,
          code: input.referral_code,
          referredUserId: user.id,
          referredEmail: user.email,
          referredStripeCustomerId:
            typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        });

        return {
          ok: true as const,
          checkout_url: session.url,
          session_id: session.id,
          free_car_washes_per_month: freeCarWashes,
        };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[stripe-create-checkout] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
