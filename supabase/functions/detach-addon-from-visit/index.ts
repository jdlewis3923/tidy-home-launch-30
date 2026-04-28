// Tidy — Remove an add-on from the customer's upcoming visit.
// Reverses Stripe invoice item + Jobber line item + marks row 'removed'.
//
// Auth: signed-in customer; can only detach their own attaches.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

const BodySchema = z.object({ attach_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims } = await userClient.auth.getClaims(auth.slice(7));
  if (!claims?.claims?.sub) return jsonResponse({ ok: false, error: 'invalid_jwt' }, 401);
  const userId = claims.claims.sub as string;

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: 'validation_failed' }, 400);
  const { attach_id } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error } = await admin
    .from('addon_attaches')
    .select('id, user_id, status, stripe_invoice_item_id, jobber_line_item_id')
    .eq('id', attach_id)
    .maybeSingle();
  if (error || !row) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (row.user_id !== userId) return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  if (row.status !== 'pending_visit') {
    return jsonResponse({ ok: false, error: `cannot_remove_${row.status}` }, 409);
  }

  // Stripe delete (only works for non-invoiced items)
  if (STRIPE_SECRET_KEY && row.stripe_invoice_item_id) {
    try {
      await fetch(`https://api.stripe.com/v1/invoiceitems/${row.stripe_invoice_item_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${STRIPE_SECRET_KEY}` },
      });
    } catch (err) { console.error('[detach-addon] stripe', err); }
  }

  await admin.from('addon_attaches')
    .update({ status: 'removed', removed_at: new Date().toISOString() })
    .eq('id', attach_id);

  return jsonResponse({ ok: true });
});
