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

// Server-side mirror of src/lib/addon-catalog.ts.
const CATALOG: Record<string, { name: string; price: number; service: string }> = {
  inside_oven:        { name: 'Inside Oven Clean',     price: 45, service: 'cleaning' },
  inside_fridge:      { name: 'Inside Fridge Clean',   price: 35, service: 'cleaning' },
  interior_windows:   { name: 'Interior Windows',      price: 55, service: 'cleaning' },
  baseboard_scrub:    { name: 'Deep Baseboard Scrub',  price: 35, service: 'cleaning' },
  laundry_wdf:        { name: 'Laundry W/D/F',         price: 30, service: 'cleaning' },
  inside_cabinets:    { name: 'Inside Kitchen Cabinets', price: 50, service: 'cleaning' },
  hedge_trim:         { name: 'Hedge & Bush Trimming', price: 65, service: 'lawn' },
  weed_removal:       { name: 'Weed Removal',          price: 45, service: 'lawn' },
  leaf_cleanup:       { name: 'Leaf & Debris Cleanup', price: 55, service: 'lawn' },
  fertilization:      { name: 'Fertilization Treatment', price: 75, service: 'lawn' },
  driveway_pressure:  { name: 'Driveway Pressure Wash', price: 150, service: 'lawn' },
  ozone_odor:         { name: 'Ozone Odor Treatment',  price: 75, service: 'detailing' },
  pet_hair:           { name: 'Pet Hair Removal',      price: 45, service: 'detailing' },
  engine_bay:         { name: 'Engine Bay Clean',      price: 85, service: 'detailing' },
  ceramic_spray:      { name: 'Ceramic Spray Coat',    price: 85, service: 'detailing' },
};

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

  const addon = CATALOG[addon_key];
  if (!addon) return jsonResponse({ ok: false, error: 'unknown_addon' }, 400);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
        amount: String(addon.price * 100),
        currency: 'usd',
        description: `${addon.name} — add-on for visit ${visit_date ?? ''}`.trim(),
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
    stripe_addon_price_id: addon_key, // we use catalog key as price id placeholder
    addon_key,
    addon_name: addon.name,
    addon_price_cents: addon.price * 100,
    service_type: addon.service,
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
          body: JSON.stringify({ jobber_visit_id, addon_name: addon.name, addon_price: addon.price }),
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
              LAST_ADDON_TYPE: addon.name,
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
              addon_name: addon.name,
              addon_price: addon.price,
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
    addon_name: addon.name,
    addon_price: addon.price,
    status,
  });
});
