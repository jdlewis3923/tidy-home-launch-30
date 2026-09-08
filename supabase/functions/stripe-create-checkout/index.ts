// Tidy — Stripe Create Checkout Session
//
// Reads the flat CheckoutInputSchema from the client (translation lives in
// src/lib/checkout.ts), resolves Stripe prices from stripe_catalog BY LOOKUP KEY,
// builds line_items, and creates a subscription-mode Checkout Session.
//
// Model: size sets the per-visit price, cadence applies the volume curve, and
// the customer is ALWAYS billed monthly. Every plan price is interval=month at
// the billed amount, so quantity is always 1 and the lookup key carries the
// cadence (clean_2_biweekly, lawn_1_weekly, shine_3 ...).
//
// Square-footage surcharges ride along as their own monthly line, priced per
// visit x visits per month.
//
// There is NO percentage discount and NO promo code. Bundling earns one free
// premium add-on a month, chosen by the customer. The one coupon that can reach
// a session is the referral reward, validated server-side in
// _shared/referral-discount.ts. The founding offer is a set of fulfilment
// promises recorded in subscription metadata (the webhook writes them onto the
// subscription row).

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
  CLEANING_SURCHARGE,
  LAWN_SURCHARGE,
  contractorVisitPay,
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
import { checkServiceLine } from "../_shared/size-validation.ts";
import { savePlanLines, type PlanLine } from "../_shared/plan-lines.ts";
import { stripeMode, stripeSecretKey } from "../_shared/stripe-mode.ts";
import { FLORIDA_TAX, cartTriggersFloridaTax, getFloridaTaxRateId } from "../_shared/florida-tax.ts";


const STRIPE_SECRET_KEY = stripeSecretKey();
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
        /** Interior sq ft (cleaning) or turf sq ft (lawn) — drives the surcharge. */
        sq_ft: z.number().int().min(0).max(100000).nullable().optional(),
      }),
    )
    .min(1)
    .max(3),

  // The UNDERLYING size inputs — the server recomputes size and rejects a
  // mismatch, so a hand-crafted POST cannot buy a size it isn't.
  bedrooms: z.number().int().min(0).max(20).nullable().optional(),
  bathrooms: z.number().min(0).max(20).nullable().optional(),
  lawn_choice: z.enum(["small", "standard", "large", "over"]).nullable().optional(),
  vehicle_class: z
    .enum(["sedan", "coupe", "suv", "crossover", "truck", "suv3row", "van"])
    .nullable()
    .optional(),


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
  /** Which door hanger side the signup walked through: doorhanger_en | doorhanger_es. */
  landing_source: z.string().max(64).optional(),
  /** hero | card | unknown — which door-hanger panel was scanned. */
  qr_placement: z.string().max(16).optional(),
  /** ZIP printed on the scanned hanger. */
  qr_zip: z.string().max(10).optional(),
  qr_route: z.string().max(24).optional(),
  access_water_spigot: z.boolean().optional(),
  access_electrical_outlet: z.boolean().optional(),
  access_washing_allowed: z.boolean().optional(),
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

  // Car Wash and Car Detail are mutually exclusive — never both in one cart.
  const hasCarWashLine = !!input.car_wash;
  const hasCarDetailLine = input.services.some((s) => s.service === "detailing");
  if (hasCarWashLine && hasCarDetailLine) {
    return jsonResponse(
      { ok: false, error: "A detail already includes a full exterior wash — you can't have both a Car Wash and a Car Detail in the same cart." },
      400,
    );
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
        // The cadence is part of the key; every price is monthly, quantity 1.
        const serviceKeys = input.services.map((s) =>
          lookupKeyFor(s.service, s.size as CanonSize, s.frequency as CanonCadence),
        );
        const carWashKey = input.car_wash
          ? CAR_WASH_LOOKUP_KEYS[input.car_wash.size as CanonSize][input.car_wash.washes as WashCount]
          : null;

        const surchargeKeys = ["surcharge_cleaning_xl", "surcharge_lawn_xl"];
        const { data: priceRows, error: priceErr } = await supabase
          .from("stripe_catalog")
          .select("lookup_key, service_type, stripe_price_id, price_cents")
          .in("lookup_key", [
            ...serviceKeys,
            ...(carWashKey ? [carWashKey] : []),
            ...surchargeKeys,
          ])
          .eq("active", true);
        if (priceErr) throw new Error(`catalog read failed: ${priceErr.message}`);

        // deno-lint-ignore no-explicit-any
        const line_items: any[] = [];
        // Only car-care line items can ever carry Florida sales tax; residential
        // cleaning and lawn care are nontaxable services in Florida.
        const carCareIndices = new Set<number>();

        /** Per-visit surcharge for a line, or 0. Above the band it is a quote. */
        const surchargeFor = (service: string, sqFt?: number | null): number => {
          if (!sqFt) return 0;
          if (service === "cleaning") {
            if (sqFt > CLEANING_SURCHARGE.maxSqFt) return -1;
            return sqFt >= CLEANING_SURCHARGE.minSqFt ? CLEANING_SURCHARGE.perVisitDollars : 0;
          }
          if (service === "lawn") {
            if (sqFt > LAWN_SURCHARGE.maxSqFt) return -1;
            return sqFt >= LAWN_SURCHARGE.minSqFt ? LAWN_SURCHARGE.perVisitDollars : 0;
          }
          return 0;
        };

        // What each line costs the customer this month, for the parity check and
        // for the subscription snapshot the webhook writes.
        const planLines: Array<Record<string, unknown>> = [];

        for (const s of input.services) {
          const cadence = s.frequency as CanonCadence;
          const size = s.size as CanonSize;
          const key = lookupKeyFor(s.service, size, cadence);
          const row = priceRows?.find((r) => r.lookup_key === key);
          if (!row) throw new Error(`no active catalog price for lookup_key ${key}`);

          const surcharge = surchargeFor(s.service, s.sq_ft);
          if (surcharge < 0) throw new Error("property_requires_quote");

          if (s.service === "detailing") carCareIndices.add(line_items.length);
          line_items.push({ price: row.stripe_price_id, quantity: quantityFor(s.service, cadence) });

          const visits = visitsPerMonthFor(s.service, cadence);
          if (surcharge > 0) {
            // One catalog surcharge price per service, per visit. Quantity carries
            // the cadence, so switching cadence later stays correct.
            const surKey = s.service === "cleaning" ? "surcharge_cleaning_xl" : "surcharge_lawn_xl";
            const surRow = priceRows?.find((r) => r.lookup_key === surKey);
            if (!surRow) throw new Error(`no active catalog price for lookup_key ${surKey}`);
            line_items.push({ price: surRow.stripe_price_id, quantity: visits });
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
            stripe_price_id: row.stripe_price_id,
            // Never shown to a customer — used when visits are created.
            contractor_pay_cents:
              Math.round(
                contractorVisitPay({ service: s.service, size, cadence, surcharge: surcharge > 0 }) * 100,
              ),
          });
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

        // ---------- Bundle gift: one free premium add-on, never a percentage ----------
        const uniqueServices = new Set(input.services.map((s) => s.service)).size;
        const freeAddons = freeAddonsPerMonth(uniqueServices);

        // ---------- Subscription metadata for the webhook ----------
        // The plan snapshot is a row; metadata carries its id only. Inlining the
        // JSON blew Stripe's 500-character metadata value limit on any
        // two-service cart, which killed every bundle signup.
        const planLinesId = await savePlanLines(supabase, {
          userId: user.id,
          lines: planLines as unknown as PlanLine[],
          source: "hosted_checkout",
        });
        if (!planLinesId) throw new Error("could not persist the plan snapshot");

        const primary = planLines[0] as Record<string, unknown>;
        const subscriptionMetadata: Record<string, string> = {
          cohort: "founding_2026",
          signed_up_at: new Date().toISOString(),
          user_id: user.id,
          services_json: JSON.stringify(
            input.services.map((s) => ({ service: s.service, size: s.size, frequency: s.frequency })),
          ),
          sizes_json: JSON.stringify(Object.fromEntries(input.services.map((s) => [s.service, s.size]))),
          plan_lines_id: planLinesId,
          size_tier: String(primary?.size_tier ?? ""),
          cadence: String(primary?.cadence ?? ""),
          surcharge_applied: planLines.some((l) => l.surcharge_applied) ? "yes" : "no",
          surcharge_cents: String(
            planLines.reduce((sum, l) => sum + Number(l.surcharge_cents ?? 0), 0),
          ),
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
          // Founding offer — fulfilment promises, not coupons.
          founding_zip: input.zip,
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
          landing_source: input.landing_source ?? "",
          qr_placement: input.qr_placement ?? "",
          qr_zip: input.qr_zip ?? "",
          qr_route: input.qr_route ?? "",
          referral_code: (input.referral_code ?? "").trim().toUpperCase(),
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

        // ---------- Referred friend's own $50 off first month ----------
        // Validated server-side: the code must resolve to another user's
        // profile and this must be the customer's first order. A bad code is
        // logged and skipped — it never fails the checkout. Stripe treats
        // `discounts` and customer-entered promo codes as mutually exclusive;
        // this session never enabled promo-code entry, so nothing conflicts.
        const referralDiscount = await resolveReferralDiscount({
          supabase,
          code: input.referral_code,
          userId: user.id,
        });
        if (referralDiscount.apply && referralDiscount.coupon) {
          sessionParams.discounts = [{ coupon: referralDiscount.coupon }];
        }
        await logReferralDiscountDecision({
          supabase,
          decision: referralDiscount,
          userId: user.id,
          where: "checkout.session",
        });

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
          free_addons_per_month: freeAddons,
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
