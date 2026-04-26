// Tidy — Stripe Create Checkout Session (Phase 2)
//
// Reads the flat CheckoutInputSchema from the client (translation lives
// in src/lib/checkout.ts), looks up Stripe Price IDs from stripe_catalog,
// builds line_items, and creates a subscription-mode Checkout Session.
//
// Subscription metadata carries everything the stripe-webhook handler
// needs to provision the user's subscription + visit rows server-side
// (no client-side INSERTs anywhere — RLS blocks them now).

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://jointidy.co';

// Service-area ZIP allowlist (Phase 2 hardening).
const SERVICE_ZIPS = new Set(['33156', '33157', '33176', '33183', '33186']);

// ---------- Input schema (flat, server-side) ----------
const ServiceTypeEnum = z.enum(['cleaning', 'lawn', 'detailing']);
const FrequencyEnum = z.enum(['monthly', 'biweekly', 'weekly']);

const CheckoutInputSchema = z.object({
  services: z
    .array(z.object({ service: ServiceTypeEnum, frequency: FrequencyEnum }))
    .min(1)
    .max(3),
  addons: z
    .array(z.object({ addon_name: z.string().min(1).max(64), qty: z.number().int().min(1).max(20) }))
    .max(50)
    .default([]),
  promo_code: z.string().trim().min(1).max(64).optional(),
  zip: z.string().regex(/^\d{5}$/),
  preferred_day: z.string().max(20).optional(),
  preferred_time: z.string().max(20).optional(),
  lang: z.enum(['en', 'es']).default('en'),
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
    return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);
  }

  // ---------- Auth: extract user_id from JWT ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabaseAuth = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }
  const user = userData.user;

  // ---------- Validate body ----------
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  const parsed = CheckoutInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: 'validation_failed', details: parsed.error.flatten() },
      400,
    );
  }
  const input = parsed.data;

  if (!SERVICE_ZIPS.has(input.zip)) {
    return jsonResponse({ ok: false, error: 'zip_outside_service_area' }, 400);
  }

  // ---------- Service-role DB client ----------
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: 'stripe',
      event: 'checkout.session.create',
      payload: { user_id: user.id, services: input.services.map((s) => `${s.service}:${s.frequency}`) },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        // ---------- Resolve service prices from catalog ----------
        const subKeys = input.services.map((s) => ({
          service_type: s.service,
          frequency: s.frequency,
        }));
        const { data: subRows, error: subErr } = await supabase
          .from('stripe_catalog')
          .select('service_type, frequency, stripe_price_id')
          .in('service_type', subKeys.map((k) => k.service_type))
          .eq('is_addon', false)
          .eq('active', true);
        if (subErr) throw new Error(`catalog read failed: ${subErr.message}`);

        // deno-lint-ignore no-explicit-any
        const line_items: any[] = [];
        for (const s of input.services) {
          const row = subRows?.find(
            (r) => r.service_type === s.service && r.frequency === s.frequency,
          );
          if (!row) {
            throw new Error(`no active catalog price for ${s.service}:${s.frequency}`);
          }
          line_items.push({ price: row.stripe_price_id, quantity: 1 });
        }

        // ---------- Resolve add-on prices ----------
        if (input.addons.length > 0) {
          const { data: addonRows, error: addonErr } = await supabase
            .from('stripe_catalog')
            .select('addon_name, stripe_price_id')
            .eq('is_addon', true)
            .eq('active', true)
            .in('addon_name', input.addons.map((a) => a.addon_name));
          if (addonErr) throw new Error(`addon catalog read failed: ${addonErr.message}`);

          for (const a of input.addons) {
            const row = addonRows?.find((r) => r.addon_name === a.addon_name);
            if (!row) continue; // unknown add-on — skip silently
            line_items.push({ price: row.stripe_price_id, quantity: a.qty });
          }
        }

        // ---------- Bundle discount (metadata only) ----------
        const uniqueServices = new Set(input.services.map((s) => s.service)).size;
        const bundle_discount_pct =
          uniqueServices >= 3 ? 20 : uniqueServices === 2 ? 15 : 0;

        // ---------- Promo code lookup ----------
        let promoId: string | null = null;
        if (input.promo_code) {
          try {
            const found = await stripe.promotionCodes.list({
              code: input.promo_code.toUpperCase(),
              active: true,
              limit: 1,
            });
            promoId = found.data[0]?.id ?? null;
          } catch (err) {
            console.error('[checkout] promo lookup failed', err);
          }
        }

        // ---------- Subscription metadata for the webhook ----------
        const subscriptionMetadata = {
          user_id: user.id,
          services_json: JSON.stringify(input.services),
          addons_json: JSON.stringify(input.addons),
          zip: input.zip,
          preferred_day: input.preferred_day ?? '',
          preferred_time: input.preferred_time ?? '',
          lang: input.lang,
          bundle_discount_pct: String(bundle_discount_pct),
          gclid: input.gclid ?? '',
          utm_source: input.utm_source ?? '',
          utm_medium: input.utm_medium ?? '',
          utm_campaign: input.utm_campaign ?? '',
          utm_content: input.utm_content ?? '',
          utm_term: input.utm_term ?? '',
        };

        // deno-lint-ignore no-explicit-any
        const sessionParams: any = {
          mode: 'subscription',
          customer_email: user.email ?? undefined,
          client_reference_id: user.id,
          line_items,
          metadata: subscriptionMetadata,
          subscription_data: { metadata: subscriptionMetadata },
          success_url: `${SITE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${SITE_URL}/checkout/canceled`,
          allow_promotion_codes: true,
        };

        if (promoId) {
          sessionParams.discounts = [{ promotion_code: promoId }];
          // Stripe rejects discounts + allow_promotion_codes simultaneously.
          delete sessionParams.allow_promotion_codes;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);
        return { ok: true as const, checkout_url: session.url, session_id: session.id };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe-create-checkout] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
