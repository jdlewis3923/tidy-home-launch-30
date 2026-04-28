// Tidy — Backfill Stripe Customer metadata (admin-gated, idempotent)
//
// Walks all local subscriptions with a stripe_customer_id and ensures
// the Stripe Customer object carries our standard metadata bundle:
//   - user_id (Supabase auth user id)
//   - signup_source (from profiles.signup_source if present)
//   - service_tier (from profiles.service_tier if present)
//   - lang
//
// Safe to re-run; only patches customers missing one or more keys.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabaseAuth.auth.getUser();
  if (!userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRow } = await supabase
    .from('user_roles').select('role')
    .eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, error: 'forbidden' }, 403);

  try {
    const result = await withLogging({
      source: 'stripe',
      event: 'customer.metadata.backfill',
      payload: { triggered_by: userData.user.id },
      fn: async () => {
        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        const { data: subs, error: subsErr } = await supabase
          .from('subscriptions')
          .select('user_id, stripe_customer_id')
          .not('stripe_customer_id', 'is', null);
        if (subsErr) throw new Error(subsErr.message);

        let scanned = 0, patched = 0, skipped = 0;
        const errors: Array<{ user_id: string; error: string }> = [];

        // De-dupe by customer id (one customer can have multiple subs).
        const seen = new Set<string>();
        for (const row of subs ?? []) {
          const cid = row.stripe_customer_id as string;
          if (seen.has(cid)) continue;
          seen.add(cid);
          scanned++;

          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('signup_source, service_tier, language')
              .eq('user_id', row.user_id)
              .maybeSingle();

            const customer = await stripe.customers.retrieve(cid);
            if (customer.deleted) { skipped++; continue; }
            const have = (customer.metadata ?? {}) as Record<string, string>;

            const desired: Record<string, string> = {
              user_id: row.user_id,
              signup_source: prof?.signup_source ?? have.signup_source ?? 'legacy',
              service_tier: prof?.service_tier ?? have.service_tier ?? '',
              lang: prof?.language ?? have.lang ?? 'en',
            };

            const needsPatch = Object.entries(desired).some(([k, v]) => v && have[k] !== v);
            if (!needsPatch) { skipped++; continue; }

            await stripe.customers.update(cid, {
              metadata: { ...have, ...desired },
            });
            patched++;
          } catch (err) {
            errors.push({ user_id: row.user_id, error: err instanceof Error ? err.message : 'unknown' });
          }
        }

        return { ok: true as const, scanned, patched, skipped, errors };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[backfill-stripe-customer-metadata] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
