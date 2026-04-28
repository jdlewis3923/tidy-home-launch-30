// Tidy — Attach an add-on to the customer's upcoming visit.
//
// Steps:
//   1. Validate add-on key against server-side catalog
//   2. Look up Stripe customer + create draft invoice item
//   3. Add line item to Jobber visit (best-effort; logs error on fail)
//   4. Insert addon_attaches row
//   5. Update profiles.last_addon_attached_at + Brevo attrs (best-effort)
//   6. Trigger ADDON-CONFIRMED Brevo email (best-effort)
//
// Auth: signed-in customer (uses their JWT). They can only attach for themselves.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const ADDON_CONFIRMED_TEMPLATE_ID = 60;

const BodySchema = z.object({
  addon_key: z.string().min(1),
  jobber_visit_id: z.string().optional(),
  visit_date: z.string().optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(auth.slice(7));
  if (claimsErr || !claims?.claims?.sub) return jsonResponse({ ok: false, error: 'invalid_jwt' }, 401);
  const userId = claims.claims.sub as string;
  const userEmail = (claims.claims.email as string) ?? '';

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { addon_key, jobber_visit_id, visit_date } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up addon from catalog (single source of truth)
  const { data: addon, error: addonErr } = await admin
    .from('addon_catalog')
    .select('addon_key, display_name, price_cents, services, stripe_price_id, is_active')
    .eq('addon_key', addon_key)
    .maybeSingle();
  if (addonErr) return jsonResponse({ ok: false, error: 'catalog_fetch_failed', detail: addonErr.message }, 500);
  if (!addon || !addon.is_active) return jsonResponse({ ok: false, error: 'unknown_addon' }, 404);
  if (!addon.stripe_price_id) {
    return jsonResponse({ ok: false, error: 'addon_missing_stripe_price', detail: 'Run sync-addon-stripe-catalog' }, 409);
  }
  const addonName = addon.display_name as string;
  const addonPriceDollars = (addon.price_cents as number) / 100;
  const addonService = (addon.services?.[0] as string | undefined) ?? null;

  // Look up subscription for stripe_customer_id
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  let stripeInvoiceItemId: string | null = null;
  let stripeError: string | null = null;

  if (STRIPE_SECRET_KEY && sub?.stripe_customer_id) {
    try {
      const form = new URLSearchParams({
        customer: sub.stripe_customer_id,
        price: addon.stripe_price_id,
        description: `${addonName} — add-on for visit ${visit_date ?? ''}`.trim(),
      });
      const resp = await fetch('https://api.stripe.com/v1/invoiceitems', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const json = await resp.json();
      if (!resp.ok) {
        stripeError = (json.error?.message ?? `stripe_${resp.status}`) as string;
      } else {
        stripeInvoiceItemId = json.id as string;
      }
    } catch (err) {
      stripeError = err instanceof Error ? err.message : 'stripe_failed';
    }
  } else if (!sub?.stripe_customer_id) {
    stripeError = 'no_stripe_customer';
  }

  // Insert addon_attaches row regardless of Stripe (so admin can see failures)
  const status = stripeInvoiceItemId ? 'pending_visit' : 'failed';
  const { data: attachRow, error: insErr } = await admin.from('addon_attaches').insert({
    user_id: userId,
    jobber_visit_id: jobber_visit_id ?? null,
    stripe_invoice_item_id: stripeInvoiceItemId,
    stripe_addon_price_id: addon.stripe_price_id,
    addon_key,
    addon_name: addonName,
    addon_price_cents: addon.price_cents,
    service_type: addonService,
    status,
  }).select('id').single();

  if (insErr) {
    return jsonResponse({ ok: false, error: 'insert_failed', detail: insErr.message }, 500);
  }

  // Best-effort follow-ups (don't fail the request if these fail)
  if (status === 'pending_visit') {
    await admin.from('profiles').update({ last_addon_attached_at: new Date().toISOString() }).eq('user_id', userId);

    // Trigger Jobber line-item write (fire-and-forget)
    if (jobber_visit_id) {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/add-jobber-line-item`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobber_visit_id, addon_name: addonName, addon_price: addonPriceDollars }),
        });
      } catch (err) { console.error('[attach-addon] jobber call failed', err); }
    }

    // Brevo contact attrs + transactional email
    if (BREVO_API_KEY && userEmail) {
      try {
        await fetch(`https://api.brevo.com/v3/contacts/${encodeURIComponent(userEmail)}`, {
          method: 'PUT',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attributes: {
              LAST_ADDON_DATE: new Date().toISOString().slice(0, 10),
              LAST_ADDON_TYPE: addonName,
            },
          }),
        });
        await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: ADDON_CONFIRMED_TEMPLATE_ID,
            to: [{ email: userEmail }],
            params: {
              addon_name: addonName,
              addon_price: addonPriceDollars,
              visit_date: visit_date ?? '',
            },
          }),
        });
      } catch (err) { console.error('[attach-addon] brevo failed', err); }
    }
  }

  return jsonResponse({
    ok: status === 'pending_visit',
    attach_id: attachRow.id,
    stripe_invoice_item_id: stripeInvoiceItemId,
    stripe_error: stripeError,
    addon_name: addonName,
    addon_price: addonPriceDollars,
    status,
  });
});
