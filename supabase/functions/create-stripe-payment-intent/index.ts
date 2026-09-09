// Tidy — Create Stripe Subscription with embedded Payment Element
//
// Creates the Stripe Customer + Subscription server-side and returns the latest
// invoice's PaymentIntent client_secret so the browser can confirm inline.
//
// Model: three sizes (1/2/3) per service, resolved from stripe_catalog BY
// LOOKUP KEY. Cleaning and lawn are per visit and carry cadence as the item
// quantity (monthly 1, biweekly 2, weekly 4). Shine Complete and the Car Wash
// Add-On are per month, always quantity 1. No percentage discounts, no promo
// codes — bundling earns free car washes and the founding offer is a set of
// fulfilment promises recorded in metadata. The single exception is the referred
// friend's $50-off-first-month coupon (uncapped, duration "once"), validated
// server-side in _shared/referral-discount.ts. This path can be the first paid
// transaction, so it applies the coupon too.

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { withLogging } from "../_shared/withLogging.ts";
import { recordReferralAttribution } from "../_shared/referral-attribution.ts";
import {
  logReferralDiscountDecision,
  resolveReferralDiscount,
} from "../_shared/referral-discount.ts";
import {
  CAR_WASH_LOOKUP_KEYS,
  freeAddonsPerMonth,
  lookupKeyFor,
  monthlyPrice,
  perVisitPrice,
  quantityFor,
  visitsPerMonthFor,
  type CanonCadence,
  type CanonSize,
  type WashCount,
} from "../_shared/pricing-canon.ts";
import { checkServiceLine, surchargePerVisitFor } from "../_shared/size-validation.ts";
import { savePlanLines, type PlanLine } from "../_shared/plan-lines.ts";
import { stripeMode, stripeSecretKey } from "../_shared/stripe-mode.ts";

const STRIPE_SECRET_KEY = stripeSecretKey();
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SERVICE_ZIPS = new Set(["33156", "33183", "33186"]);

const ServiceTypeEnum = z.enum(["cleaning", "lawn", "detailing"]);
const FrequencyEnum = z.enum(["monthly", "biweekly", "weekly"]);
const SizeEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);

const VehicleClassEnum = z.enum(["sedan", "coupe", "suv", "crossover", "truck", "suv3row", "van"]);
const LawnChoiceEnum = z.enum(["small", "standard", "large", "over"]);

const InputSchema = z.object({
  services: z
    .array(
      z.object({
        service: ServiceTypeEnum,
        size: SizeEnum,
        frequency: FrequencyEnum,
        /** Interior sq ft (cleaning) or turf sq ft (lawn) — drives the surcharge. */
        sq_ft: z.number().int().min(0).max(100000).nullable().optional(),
      }),
    )
    .min(1)
    .max(3),
  // The UNDERLYING size inputs. The server recomputes size from these and
  // rejects a mismatch — a client-claimed size is never trusted.
  bedrooms: z.number().int().min(0).max(20).nullable().optional(),
  bathrooms: z.number().min(0).max(20).nullable().optional(),
  lawn_choice: LawnChoiceEnum.nullable().optional(),
  vehicle_class: VehicleClassEnum.nullable().optional(),
  addons: z
    .array(z.object({ addon_name: z.string().min(1).max(64), qty: z.number().int().min(1).max(20) }))
    .max(50)
    .default([]),
  car_wash: z.object({ size: SizeEnum, washes: z.union([z.literal(1), z.literal(2)]) }).optional(),
  referral_code: z.string().trim().min(1).max(64).optional(),
  zip: z.string().regex(/^\d{5}$/),
  preferred_day: z.string().max(20).optional(),
  preferred_time: z.string().max(20).optional(),
  // On-site access answers — the hosted path already carries these and
  // seedSubscriptionAndVisits reads them, so the embedded path must too.
  access_water_spigot: z.boolean().optional(),
  access_electrical_outlet: z.boolean().optional(),
  access_washing_allowed: z.boolean().optional(),
  lang: z.enum(["en", "es"]).default("en"),
  idempotency_key: z.string().min(8).max(128).optional(),
  // Attribution
  gclid: z.string().max(500).optional(),
  utm_source: z.string().max(500).optional(),
  utm_medium: z.string().max(500).optional(),
  utm_campaign: z.string().max(500).optional(),
  utm_content: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(),
  /** Which door hanger side the signup walked through: doorhanger_en | doorhanger_es. */
  landing_source: z.string().max(64).optional(),
  /** hero | card | unknown — which door-hanger panel was scanned. */
  qr_placement: z.string().max(16).optional(),
  /** ZIP printed on the scanned hanger. */
  qr_zip: z.string().max(10).optional(),
  qr_route: z.string().max(24).optional(),
});

async function deterministicKey(userId: string, payload: unknown): Promise<string> {
  const enc = new TextEncoder().encode(userId + ":" + JSON.stringify(payload));
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 48);
}


/** The price id for the active Stripe mode — test bookings use the test twin. */
// deno-lint-ignore no-explicit-any
function priceIdOf(row: any): string {
  const id = stripeMode() === "test" ? row?.stripe_price_id_test ?? null : row?.stripe_price_id ?? null;
  if (!id) throw new Error(`no ${stripeMode()}-mode price id for lookup_key ${row?.lookup_key ?? row?.addon_name}`);
  return id;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: "Stripe not configured" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  const user = userData.user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "validation_failed", details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  if (!SERVICE_ZIPS.has(input.zip)) return jsonResponse({ ok: false, error: "zip_outside_service_area" }, 400);

  const hasHomeService = input.services.some((s) => s.service === "lawn" || s.service === "cleaning");
  if (input.car_wash && !hasHomeService) {
    return jsonResponse({ ok: false, error: "car_wash_requires_home_service" }, 400);
  }

  // ---------- Recompute every size server-side ----------
  for (const s of input.services) {
    const check = checkServiceLine({
      service: s.service,
      claimedSize: s.size,
      sqFt: s.sq_ft ?? null,
      inputs: {
        bedrooms: input.bedrooms ?? null,
        bathrooms: input.bathrooms ?? null,
        lawn_choice: input.lawn_choice ?? null,
        turf_sq_ft: s.service === "lawn" ? s.sq_ft ?? null : null,
        vehicle_class: input.vehicle_class ?? null,
      },
    });
    if (!check.ok) {
      return jsonResponse({ ok: false, error: check.error, detail: check.detail }, 400);
    }
  }


  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: "stripe",
      event: "subscription.create.embedded",
      payload: { user_id: user.id, services: input.services.map((s) => `${s.service}:${s.size}:${s.frequency}`) },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2024-12-18.acacia",
          httpClient: Stripe.createFetchHttpClient(),
        });

        // ---------- Resolve recurring prices by lookup key ----------
        // The cadence is PART of the key. Indexing SERVICE_LOOKUP_KEYS by size
        // alone yields the {monthly,biweekly,weekly} object, which is why this
        // path used to die on "[object Object]" before Stripe was ever called.
        const serviceKeys = input.services.map((s) =>
          lookupKeyFor(s.service, s.size as CanonSize, s.frequency as CanonCadence),
        );
        const carWashKey = input.car_wash
          ? CAR_WASH_LOOKUP_KEYS[input.car_wash.size as CanonSize][input.car_wash.washes as WashCount]
          : null;
        const surchargeKeys = ["surcharge_cleaning_xl", "surcharge_lawn_xl"];

        const { data: priceRows, error: priceErr } = await supabase
          .from("stripe_catalog")
          .select("lookup_key, stripe_price_id, stripe_price_id_test")
          .in("lookup_key", [...serviceKeys, ...(carWashKey ? [carWashKey] : []), ...surchargeKeys])
          .eq("active", true);
        if (priceErr) throw new Error(`catalog read failed: ${priceErr.message}`);

        // deno-lint-ignore no-explicit-any
        const items: any[] = [];
        const planLines: PlanLine[] = [];

        for (const s of input.services) {
          const cadence = s.frequency as CanonCadence;
          const size = s.size as CanonSize;
          const key = lookupKeyFor(s.service, size, cadence);
          const row = priceRows?.find((r) => r.lookup_key === key);
          if (!row) throw new Error(`no active catalog price for lookup_key ${key}`);
          items.push({ price: priceIdOf(row), quantity: quantityFor(s.service, cadence) });

          // Square-footage surcharge: one recurring price, per visit, with the
          // quantity carrying the cadence (monthly 1, biweekly 2, weekly 4).
          const surcharge = surchargePerVisitFor(s.service, s.sq_ft ?? null);
          const visits = visitsPerMonthFor(s.service, cadence);
          if (surcharge > 0) {
            const surKey = s.service === "cleaning" ? "surcharge_cleaning_xl" : "surcharge_lawn_xl";
            const surRow = priceRows?.find((r) => r.lookup_key === surKey);
            if (!surRow) throw new Error(`no active catalog price for lookup_key ${surKey}`);
            items.push({ price: priceIdOf(surRow), quantity: visits });
          }

          planLines.push({
            service: s.service,
            size_tier: size,
            cadence,
            surcharge_applied: surcharge > 0,
            surcharge_cents: surcharge * 100,
            visits_per_month: visits,
            per_visit_cents: Math.round((perVisitPrice(s.service, size, cadence) + surcharge) * 100),
            monthly_cents: Math.round(monthlyPrice(s.service, size, cadence, surcharge) * 100),
            lookup_key: key,
            stripe_price_id: priceIdOf(row),
            // Contractor pay is deliberately NOT part of the snapshot: the plan
            // line is customer-readable. Visit pay is derived server-side from
            // canon by generate_recurring_visits.
          });
        }

        if (carWashKey) {
          const row = priceRows?.find((r) => r.lookup_key === carWashKey);
          if (!row) throw new Error(`no active catalog price for lookup_key ${carWashKey}`);
          items.push({ price: priceIdOf(row), quantity: 1 });
        }


        // Resolve one-time add-ons
        if (input.addons.length > 0) {
          const { data: addonRows, error: addonErr } = await supabase
            .from("stripe_catalog")
            .select("addon_name, stripe_price_id, stripe_price_id_test")
            .eq("is_addon", true)
            .eq("active", true)
            .in(
              "addon_name",
              input.addons.map((a) => a.addon_name),
            );
          if (addonErr) throw new Error(`addon catalog read failed: ${addonErr.message}`);
          for (const a of input.addons) {
            const row = addonRows?.find((r) => r.addon_name === a.addon_name);
            if (!row) continue;
            items.push({ price: priceIdOf(row), quantity: a.qty });
          }
        }

        // Find or create the Stripe customer with rich metadata
        let customerId: string | null = null;
        const existing = await stripe.customers.search({
          query: `metadata['user_id']:'${user.id}'`,
          limit: 1,
        });
        if (existing.data[0]) {
          customerId = existing.data[0].id;
        } else {
          const customer = await stripe.customers.create({
            email: user.email ?? undefined,
            metadata: {
              cohort: "founding_2026",
              signed_up_at: new Date().toISOString(),
              user_id: user.id,
              signup_source: "embedded_checkout",
              zip: input.zip,
              lang: input.lang,
              gclid: input.gclid ?? "",
              utm_source: input.utm_source ?? "",
              utm_medium: input.utm_medium ?? "",
              utm_campaign: input.utm_campaign ?? "",
            },
          });
          customerId = customer.id;
        }

        const uniqueServices = new Set(input.services.map((s) => s.service)).size;
        const freeAddons = freeAddonsPerMonth(uniqueServices);

        // The plan snapshot goes in a table; metadata carries only its id, so a
        // two-service cart can never blow Stripe's 500-character value limit.
        const planLinesId = await savePlanLines(supabase, {
          userId: user.id,
          lines: planLines,
          source: "embedded_checkout",
        });
        if (!planLinesId) throw new Error("could not persist the plan snapshot");

        const primary = planLines[0];
        const subscriptionMetadata: Record<string, string> = {
          cohort: "founding_2026",
          signed_up_at: new Date().toISOString(),
          user_id: user.id,
          services_json: JSON.stringify(input.services.map((s) => ({ service: s.service, size: s.size, frequency: s.frequency }))),
          sizes_json: JSON.stringify(Object.fromEntries(input.services.map((s) => [s.service, s.size]))),
          plan_lines_id: planLinesId,
          size_tier: String(primary?.size_tier ?? ""),
          cadence: String(primary?.cadence ?? ""),
          surcharge_applied: planLines.some((l) => l.surcharge_applied) ? "yes" : "no",
          surcharge_cents: String(planLines.reduce((sum, l) => sum + l.surcharge_cents, 0)),
          addons_json: JSON.stringify(input.addons),
          car_wash_json: input.car_wash ? JSON.stringify(input.car_wash) : "",
          free_addons_per_month: String(freeAddons),
          zip: input.zip,
          preferred_day: input.preferred_day ?? "",
          preferred_time: input.preferred_time ?? "",
          access_water_spigot: input.access_water_spigot === true ? "yes" : input.access_water_spigot === false ? "no" : "",
          access_electrical_outlet: input.access_electrical_outlet === true ? "yes" : input.access_electrical_outlet === false ? "no" : "",
          access_washing_allowed: input.access_washing_allowed === true ? "yes" : input.access_washing_allowed === false ? "no" : "",
          lang: input.lang,
          founding_zip: input.zip,
          founding_rate_locked: "yes",
          founding_free_addon_first_visit: "yes",
          founding_review_promised: "yes",
          signup_source: "embedded_checkout",
          gclid: input.gclid ?? "",
          utm_source: input.utm_source ?? "",
          utm_medium: input.utm_medium ?? "",
          utm_campaign: input.utm_campaign ?? "",
          utm_content: input.utm_content ?? "",
          utm_term: input.utm_term ?? "",
          landing_source: input.landing_source ?? "",
          qr_placement: input.qr_placement ?? "",
          qr_zip: input.qr_zip ?? "",
          qr_route: input.qr_route ?? "",
          referral_code: (input.referral_code ?? "").trim().toUpperCase(),
        };

        // The key must change whenever the request changes. A client-supplied
        // label like "cfg:33156:cleaning:2:biweekly" is stable across a changed
        // surcharge, a changed Stripe mode or a changed price id, and Stripe
        // rejects a reused key with different parameters — which is why editing
        // a plan and retrying used to 500 forever. Always fingerprint the
        // resolved line items and the mode, and treat the client label as a
        // hint only.
        const idempotencyKey = await deterministicKey(user.id, {
          label: input.idempotency_key ?? "",
          mode: stripeMode(),
          items,
        });


        // deno-lint-ignore no-explicit-any
        const subParams: any = {
          customer: customerId!,
          items,
          payment_behavior: "default_incomplete",
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
          metadata: subscriptionMetadata,
        };

        // ---------- Referred friend's own $50 off first month ----------
        const referralDiscount = await resolveReferralDiscount({
          supabase,
          code: input.referral_code,
          userId: user.id,
        });
        if (referralDiscount.apply && referralDiscount.coupon) {
          subParams.discounts = [{ coupon: referralDiscount.coupon }];
        }
        await logReferralDiscountDecision({
          supabase,
          decision: referralDiscount,
          userId: user.id,
          where: "subscription.embedded",
        });

        const subscription = await stripe.subscriptions.create(subParams, {
          idempotencyKey: `sub:${idempotencyKey}`,
        });

        // deno-lint-ignore no-explicit-any
        const invoice: any = subscription.latest_invoice;
        // deno-lint-ignore no-explicit-any
        const paymentIntent: any = invoice?.payment_intent;
        const clientSecret = paymentIntent?.client_secret as string | undefined;

        // Referral attribution (pending row; payout happens on first paid invoice).
        await recordReferralAttribution({
          supabase,
          stripe,
          code: input.referral_code,
          referredUserId: user.id,
          referredEmail: user.email,
          referredStripeCustomerId: customerId,
        });

        if (!clientSecret) {
          throw new Error("stripe did not return a client_secret for the subscription invoice");
        }

        return {
          ok: true as const,
          client_secret: clientSecret,
          // The browser compares this with its publishable key: a pk_test page
          // can never confirm a live PaymentIntent, so the mismatch has to be
          // caught before the customer taps Pay.
          stripe_mode: stripeMode(),
          subscription_id: subscription.id,
          customer_id: customerId,
          free_addons_per_month: freeAddons,
        };

      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[create-stripe-payment-intent] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
