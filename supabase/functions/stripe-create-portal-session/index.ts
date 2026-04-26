// Tidy — Stripe Billing Portal Session
//
// Auth-gated. Looks up the user's stripe_customer_id from the most recent
// active subscription and mints a Stripe Billing Portal session, returning
// the redirect URL.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SITE_URL = Deno.env.get('SITE_URL') ?? 'https://jointidy.co';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ ok: false, error: 'Stripe not configured' }, 500);
  }

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: 'stripe',
      event: 'portal.session.create',
      payload: { user_id: userData.user.id },
      fn: async () => {
        const { data: subRow, error: subErr } = await supabase
          .from('subscriptions')
          .select('stripe_customer_id')
          .eq('user_id', userData.user!.id)
          .not('stripe_customer_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subErr) throw new Error(subErr.message);
        if (!subRow?.stripe_customer_id) {
          return { ok: false as const, error: 'no_subscription' };
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: '2024-12-18.acacia',
          httpClient: Stripe.createFetchHttpClient(),
        });

        const session = await stripe.billingPortal.sessions.create({
          customer: subRow.stripe_customer_id,
          return_url: `${SITE_URL}/billing`,
        });

        return { ok: true as const, portal_url: session.url, url: session.url };
      },
    });

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[stripe-create-portal-session] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
