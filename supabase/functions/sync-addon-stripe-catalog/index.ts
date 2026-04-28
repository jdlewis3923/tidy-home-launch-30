// Tidy — Sync add-on catalog rows into Stripe (Products + Prices).
//
// Admin-only, idempotent. For each row in addon_catalog missing a
// stripe_price_id (or stripe_product_id), creates a Stripe Product
// and a Stripe Price (one-time) and writes the IDs back. Existing
// rows that already have IDs are skipped.
//
// Returns: { ok, created, skipped, errors: [{ addon_key, error }] }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

async function stripeForm(path: string, params: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(params).toString();
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message ?? `stripe_${resp.status}`);
  return json;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'missing_stripe_key' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  // Verify caller is admin.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(auth.slice(7));
  if (claimsErr || !claims?.claims?.sub) return jsonResponse({ ok: false, error: 'invalid_jwt' }, 401);
  const userId = claims.claims.sub as string;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!roleRow) return jsonResponse({ ok: false, error: 'forbidden' }, 403);

  const { data: rows, error: selErr } = await admin
    .from('addon_catalog')
    .select('id, addon_key, display_name, price_cents, stripe_product_id, stripe_price_id, is_active')
    .order('sort_order', { ascending: true });
  if (selErr) return jsonResponse({ ok: false, error: 'catalog_fetch_failed', detail: selErr.message }, 500);

  const created: string[] = [];
  const skipped: string[] = [];
  const errors: { addon_key: string; error: string }[] = [];

  for (const row of rows ?? []) {
    if (row.stripe_price_id && row.stripe_product_id) {
      skipped.push(row.addon_key);
      continue;
    }
    try {
      let productId = row.stripe_product_id as string | null;
      if (!productId) {
        const product = await stripeForm('products', {
          name: row.display_name,
          'metadata[addon_key]': row.addon_key,
          'metadata[source]': 'tidy_addon_catalog',
        });
        productId = product.id as string;
      }
      let priceId = row.stripe_price_id as string | null;
      if (!priceId) {
        const price = await stripeForm('prices', {
          product: productId!,
          unit_amount: String(row.price_cents),
          currency: 'usd',
          'metadata[addon_key]': row.addon_key,
        });
        priceId = price.id as string;
      }
      const { error: updErr } = await admin
        .from('addon_catalog')
        .update({ stripe_product_id: productId, stripe_price_id: priceId })
        .eq('id', row.id);
      if (updErr) throw new Error(`db_update_failed: ${updErr.message}`);
      created.push(row.addon_key);
    } catch (err) {
      errors.push({ addon_key: row.addon_key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return jsonResponse({
    ok: errors.length === 0,
    created,
    skipped,
    errors,
    total: rows?.length ?? 0,
  });
});
