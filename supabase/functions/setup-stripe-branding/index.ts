// Tidy — Stripe Branding & Config Sync (admin-gated, idempotent)
//
// Drives all Stripe Dashboard settings we can drive via API:
//   1. Account branding (primary/secondary color, support email/phone, statement_descriptor)
//   2. Billing portal configuration (allowed updates, all active subscription products,
//      cancel-at-period-end with custom reason flow, business info)
//   3. Webhook endpoint event type sync (adds any missing event types)
//
// Returns the dashboard-only items the user still has to handle manually
// (logo upload, Radar custom rules, Tax setup).

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.updated',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'payment_method.attached',
];

const BRAND = {
  primary: '#0F172A',   // Navy ink
  secondary: '#2563EB', // Primary blue
  support_email: 'hello@jointidy.co',
  support_phone: '+13055551234', // placeholder; see dashboard_only_items
  statement_descriptor: 'TIDY HOME',
  business_url: 'https://jointidy.co',
  privacy_url: 'https://jointidy.co/privacy',
  terms_url: 'https://jointidy.co/terms',
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);

  // ---------- Admin gate ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, error: 'forbidden' }, 403);

  try {
    const result = await withLogging({
      source: 'stripe',
      event: 'config.branding.sync',
      payload: { user_id: userData.user.id },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        // 1) ---------- Account branding ----------
        // Stripe allows updating branding + business_profile via /v1/account.
        let branding_set = false;
        try {
          await stripe.accounts.update('', {
            // Empty string targets the default account for this API key.
            settings: {
              branding: {
                primary_color: BRAND.primary,
                secondary_color: BRAND.secondary,
              },
              payments: {
                statement_descriptor: BRAND.statement_descriptor,
              },
            },
            business_profile: {
              support_email: BRAND.support_email,
              url: BRAND.business_url,
              support_url: BRAND.business_url + '/help',
            },
            // deno-lint-ignore no-explicit-any
          } as any);
          branding_set = true;
        } catch (err) {
          // Stripe will reject account.update for some account types — log + continue.
          console.warn('[setup-stripe-branding] account.update warning', err instanceof Error ? err.message : err);
        }

        // 2) ---------- Webhook endpoint event sync ----------
        const webhook_events_added: string[] = [];
        try {
          const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
          // Match by URL containing our project ref (works for Live + Test endpoints).
          const ours = endpoints.data.find((e) => e.url.includes('vcdhpsfuilrrrqfhfsjt.supabase.co'));
          if (ours) {
            const have = new Set(ours.enabled_events);
            const missing = REQUIRED_WEBHOOK_EVENTS.filter((e) => !have.has(e));
            if (missing.length > 0) {
              const merged = Array.from(new Set([...ours.enabled_events, ...REQUIRED_WEBHOOK_EVENTS]));
              await stripe.webhookEndpoints.update(ours.id, {
                // deno-lint-ignore no-explicit-any
                enabled_events: merged as any,
              });
              webhook_events_added.push(...missing);
            }
          }
        } catch (err) {
          console.warn('[setup-stripe-branding] webhook sync warning', err instanceof Error ? err.message : err);
        }

        // 3) ---------- Billing portal config ----------
        // List all active subscription products from stripe_catalog.
        const { data: catRows } = await supabase
          .from('stripe_catalog')
          .select('stripe_product_id, stripe_price_id')
          .eq('is_addon', false)
          .eq('active', true)
          .not('stripe_product_id', 'is', null);

        const productMap = new Map<string, Set<string>>();
        for (const row of catRows ?? []) {
          if (!row.stripe_product_id || !row.stripe_price_id) continue;
          if (!productMap.has(row.stripe_product_id)) productMap.set(row.stripe_product_id, new Set());
          productMap.get(row.stripe_product_id)!.add(row.stripe_price_id);
        }
        const products = Array.from(productMap.entries()).map(([product, prices]) => ({
          product,
          prices: Array.from(prices),
        }));

        let portal_config_id: string | null = null;
        // deno-lint-ignore no-explicit-any
        const portalParams: any = {
          business_profile: {
            headline: 'manage your tidy subscription',
            privacy_policy_url: BRAND.privacy_url,
            terms_of_service_url: BRAND.terms_url,
          },
          features: {
            customer_update: {
              enabled: true,
              allowed_updates: ['email', 'phone', 'address', 'name'],
            },
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
            subscription_cancel: {
              enabled: true,
              mode: 'at_period_end',
              cancellation_reason: {
                enabled: true,
                options: [
                  'too_expensive',
                  'missing_features',
                  'switched_service',
                  'unused',
                  'customer_service',
                  'too_complex',
                  'low_quality',
                  'other',
                ],
              },
            },
            subscription_update: products.length
              ? {
                  enabled: true,
                  default_allowed_updates: ['price', 'quantity', 'promotion_code'],
                  proration_behavior: 'create_prorations',
                  products,
                }
              : { enabled: false },
          },
          default_return_url: 'https://jointidy.co/billing',
          metadata: { managed_by: 'tidy-setup-stripe-branding' },
        };

        try {
          // Find an existing portal config we own (idempotency by metadata tag).
          const existing = await stripe.billingPortal.configurations.list({ limit: 100, is_default: false });
          const ours = existing.data.find((c) => c.metadata?.managed_by === 'tidy-setup-stripe-branding');
          if (ours) {
            const updated = await stripe.billingPortal.configurations.update(ours.id, portalParams);
            portal_config_id = updated.id;
          } else {
            const created = await stripe.billingPortal.configurations.create(portalParams);
            portal_config_id = created.id;
          }

          // Persist the active portal config id for stripe-create-portal-session to consume.
          await supabase.from('app_settings').upsert(
            {
              key: 'stripe_portal_config_id',
              value: { id: portal_config_id, updated_at: new Date().toISOString() },
              updated_at: new Date().toISOString(),
              updated_by: userData.user!.id,
            },
            { onConflict: 'key' },
          );
        } catch (err) {
          console.error('[setup-stripe-branding] portal config failed', err);
        }

        return {
          ok: true as const,
          branding_set,
          portal_config_id,
          webhook_events_added,
          products_in_portal: products.length,
          dashboard_only_items: [
            'logo_image — upload at Stripe Dashboard → Settings → Branding',
            'icon_image — upload at Stripe Dashboard → Settings → Branding',
            'smart_retries_max_attempts — Stripe Dashboard → Billing → Subscriptions → Retries',
            'tax_setup — Stripe Dashboard → Tax → Get started',
            'radar_rules — Stripe Dashboard → Radar → Rules (custom rules)',
            'support_phone — confirm/replace placeholder in Stripe Dashboard → Public details',
          ],
        };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[setup-stripe-branding] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
