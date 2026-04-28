// Tidy — Create Stripe Subscription with embedded Payment Element
//
// Replaces the redirect-to-Checkout flow on /signup by creating the
// Stripe Customer + Subscription server-side and returning the latest
// invoice's PaymentIntent client_secret. The browser confirms the
// payment inline using @stripe/react-stripe-js Payment Element — the
// customer never leaves jointidy.co.
//
// Idempotency: pass a client-supplied `idempotency_key` so retries do
// not create duplicate subscriptions. Falls back to a deterministic
// hash of (user_id + sorted line_items) when missing.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SERVICE_ZIPS = new Set(['33156', '33157', '33176', '33183', '33186']);

const ServiceTypeEnum = z.enum(['cleaning', 'lawn', 'detailing']);
const FrequencyEnum = z.enum(['monthly', 'biweekly', 'weekly']);

const InputSchema = z.object({
  services: z.array(z.object({ service: ServiceTypeEnum, frequency: FrequencyEnum })).min(1).max(3),
  addons: z.array(z.object({ addon_name: z.string().min(1).max(64), qty: z.number().int().min(1).max(20) })).max(50).default([]),
  promo_code: z.string().trim().min(1).max(64).optional(),
  zip: z.string().regex(/^\d{5}$/),
  preferred_day: z.string().max(20).optional(),
  preferred_time: z.string().max(20).optional(),
  lang: z.enum(['en', 'es']).default('en'),
  idempotency_key: z.string().min(8).max(128).optional(),
  // Attribution
  gclid: z.string().max(500).optional(),
  utm_source: z.string().max(500).optional(),
  utm_medium: z.string().max(500).optional(),
  utm_campaign: z.string().max(500).optional(),
  utm_content: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(),
});

async function deterministicKey(userId: string, payload: unknown): Promise<string> {
  const enc = new TextEncoder().encode(userId + ':' + JSON.stringify(payload));
  const hash = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 48);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const user = userData.user;

  let body: unknown;
  try { body = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400); }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;
  if (!SERVICE_ZIPS.has(input.zip)) return jsonResponse({ ok: false, error: 'zip_outside_service_area' }, 400);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: 'stripe',
      event: 'subscription.create.embedded',
      payload: { user_id: user.id, services: input.services.map((s) => `${s.service}:${s.frequency}`) },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        // Resolve service prices
        const { data: subRows, error: subErr } = await supabase
          .from('stripe_catalog')
          .select('service_type, frequency, stripe_price_id')
          .in('service_type', input.services.map((s) => s.service))
          .eq('is_addon', false)
          .eq('active', true);
        if (subErr) throw new Error(`catalog read failed: ${subErr.message}`);

        // deno-lint-ignore no-explicit-any
        const items: any[] = [];
        for (const s of input.services) {
          const row = subRows?.find((r) => r.service_type === s.service && r.frequency === s.frequency);
          if (!row) throw new Error(`no active catalog price for ${s.service}:${s.frequency}`);
          items.push({ price: row.stripe_price_id, quantity: 1 });
        }

        // Resolve add-ons
        if (input.addons.length > 0) {
          const { data: addonRows, error: addonErr } = await supabase
            .from('stripe_catalog')
            .select('addon_name, stripe_price_id')
            .eq('is_addon', true).eq('active', true)
            .in('addon_name', input.addons.map((a) => a.addon_name));
          if (addonErr) throw new Error(`addon catalog read failed: ${addonErr.message}`);
          for (const a of input.addons) {
            const row = addonRows?.find((r) => r.addon_name === a.addon_name);
            if (!row) continue;
            items.push({ price: row.stripe_price_id, quantity: a.qty });
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
              user_id: user.id,
              signup_source: 'embedded_checkout',
              zip: input.zip,
              lang: input.lang,
              gclid: input.gclid ?? '',
              utm_source: input.utm_source ?? '',
              utm_medium: input.utm_medium ?? '',
              utm_campaign: input.utm_campaign ?? '',
            },
          });
          customerId = customer.id;
        }

        const uniqueServices = new Set(input.services.map((s) => s.service)).size;
        const bundle_discount_pct = uniqueServices >= 3 ? 20 : uniqueServices === 2 ? 15 : 0;

        // Promo code lookup → coupon
        let promoId: string | null = null;
        if (input.promo_code) {
          try {
            const found = await stripe.promotionCodes.list({
              code: input.promo_code.toUpperCase(), active: true, limit: 1,
            });
            promoId = found.data[0]?.id ?? null;
          } catch (err) { console.error('[embedded] promo lookup failed', err); }
        }

        const subscriptionMetadata = {
          user_id: user.id,
          services_json: JSON.stringify(input.services),
          addons_json: JSON.stringify(input.addons),
          zip: input.zip,
          preferred_day: input.preferred_day ?? '',
          preferred_time: input.preferred_time ?? '',
          lang: input.lang,
          bundle_discount_pct: String(bundle_discount_pct),
          signup_source: 'embedded_checkout',
          gclid: input.gclid ?? '',
          utm_source: input.utm_source ?? '',
          utm_medium: input.utm_medium ?? '',
          utm_campaign: input.utm_campaign ?? '',
          utm_content: input.utm_content ?? '',
          utm_term: input.utm_term ?? '',
        };

        const idempotencyKey = input.idempotency_key
          ?? await deterministicKey(user.id, { items, ts: Math.floor(Date.now() / 60000) });

        // deno-lint-ignore no-explicit-any
        const subParams: any = {
          customer: customerId!,
          items,
          payment_behavior: 'default_incomplete',
          payment_settings: {
            payment_method_types: ['card'],
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent', 'pending_setup_intent'],
          metadata: subscriptionMetadata,
        };
        if (promoId) subParams.promotion_code = promoId;

        const subscription = await stripe.subscriptions.create(subParams, {
          idempotencyKey: `sub:${idempotencyKey}`,
        });

        // deno-lint-ignore no-explicit-any
        const invoice: any = subscription.latest_invoice;
        // deno-lint-ignore no-explicit-any
        const paymentIntent: any = invoice?.payment_intent;
        const clientSecret = paymentIntent?.client_secret as string | undefined;

        if (!clientSecret) {
          throw new Error('stripe did not return a client_secret for the subscription invoice');
        }

        return {
          ok: true as const,
          client_secret: clientSecret,
          subscription_id: subscription.id,
          customer_id: customerId,
        };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[create-stripe-payment-intent] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
