// Tidy — B3/B4. The customer's approve/decline surface for a walkaround
// add-on request. Public and token-authenticated: the SMS link has to work on
// a phone with no session, so the high-entropy token in addon_requests IS the
// credential. No JWT required, and the token only ever reaches one request.
//
// GET  ?token=...  -> the request as the customer should see it.
// POST { token, action: 'approve' | 'decline' }
//
// On approve: the card on file is charged off-session for the CATALOG price
// (never a client-supplied amount), the Pro's share is added to their pay for
// that visit, and the Pro is told to go ahead.
// On decline: nothing is charged, the Pro is told to skip it, and the job is
// flagged so a later low rating about that exact condition is quarantined
// rather than counted against the Pro.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { notifyPro } from '../_shared/pro-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

/** Pro share of an add-on, by tier. Same split as base visit pay. */
const TIER_SHARE: Record<string, number> = {
  tier_1_verified: 0.4,
  tier_2_trusted: 0.45,
  tier_3_elite: 0.5,
};

const BodySchema = z.object({
  token: z.string().min(32).max(128),
  action: z.enum(['approve', 'decline']),
}).strict();

async function stripeForm(path: string, params: Record<string, string>) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json?.error?.message ?? `stripe_${resp.status}`);
  return json;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ------------------------------- GET ------------------------------------
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token') ?? '';
    if (token.length < 32) return jsonResponse({ ok: false, error: 'invalid_token' }, 400);

    const { data: reqRow } = await admin
      .from('addon_requests')
      .select('id, addon_name, condition_note, photo_url, status, amount_cents, minutes_estimate, expires_at, pro_id, job_id')
      .eq('token', token)
      .maybeSingle();
    if (!reqRow) return jsonResponse({ ok: false, error: 'not_found' }, 404);

    const expired = reqRow.status === 'pending' && new Date(reqRow.expires_at).getTime() < Date.now();

    let photoUrl: string | null = null;
    if (reqRow.photo_url) {
      const { data: signed } = await admin.storage
        .from('job-condition-photos')
        .createSignedUrl(reqRow.photo_url, 60 * 60);
      photoUrl = signed?.signedUrl ?? null;
    }
    const { data: pro } = await admin
      .from('applicants').select('first_name').eq('contractor_id', reqRow.pro_id).maybeSingle();

    return jsonResponse({
      ok: true,
      request: {
        addon_name: reqRow.addon_name,
        condition_note: reqRow.condition_note,
        amount_cents: reqRow.amount_cents,
        minutes_estimate: reqRow.minutes_estimate,
        status: expired ? 'expired' : reqRow.status,
        expires_at: reqRow.expires_at,
        photo_url: photoUrl,
        pro_first_name: pro?.first_name ?? 'Your Pro',
      },
    });
  }

  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const { token, action } = parsed.data;

  const { data: reqRow } = await admin
    .from('addon_requests')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!reqRow) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (reqRow.status !== 'pending') {
    return jsonResponse({ ok: false, error: 'already_resolved', status: reqRow.status }, 409);
  }
  if (new Date(reqRow.expires_at).getTime() < Date.now()) {
    await admin.from('addon_requests')
      .update({ status: 'expired', responded_at: new Date().toISOString() })
      .eq('id', reqRow.id).eq('status', 'pending');
    return jsonResponse({ ok: false, error: 'expired' }, 409);
  }

  const { data: pro } = await admin
    .from('applicants')
    .select('id, first_name, tier')
    .eq('contractor_id', reqRow.pro_id)
    .maybeSingle();

  // ----------------------------- DECLINE ----------------------------------
  if (action === 'decline') {
    // Claim the row first so a double-tap can't fire two notifications.
    const { data: claimed } = await admin
      .from('addon_requests')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', reqRow.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) return jsonResponse({ ok: false, error: 'already_resolved' }, 409);

    // B5 — the Pro flagged the condition and was told no. Protect their rating.
    if (reqRow.pro_visit_id) {
      await admin.from('pro_visits').update({
        condition_flagged: true,
        condition_photo_url: reqRow.photo_url,
        condition_note: reqRow.condition_note,
        declined_addon_name: reqRow.addon_name,
      }).eq('id', reqRow.pro_visit_id);
    }

    await notifyPro(admin, {
      contractor_id: reqRow.pro_id,
      kind: 'addon_declined',
      title: `Declined — skip the ${reqRow.addon_name}`,
      body: 'Do the scope they already booked and note the condition. This will not count against your rating.',
      url: `/pro/job/${reqRow.job_id}`,
      context: { addon_request_id: reqRow.id, job_id: reqRow.job_id },
    });

    return jsonResponse({ ok: true, status: 'declined' });
  }

  // ----------------------------- APPROVE ----------------------------------
  if (!STRIPE_SECRET_KEY) return jsonResponse({ ok: false, error: 'missing_stripe_key' }, 500);
  if (!reqRow.customer_id) return jsonResponse({ ok: false, error: 'no_customer_on_request' }, 409);
  if (!reqRow.amount_cents || reqRow.amount_cents <= 0) {
    return jsonResponse({ ok: false, error: 'addon_has_no_price' }, 409);
  }

  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', reqRow.customer_id)
    .not('stripe_customer_id', 'is', null)
    .maybeSingle();
  const stripeCustomerId = (sub as { stripe_customer_id?: string } | null)?.stripe_customer_id;
  if (!stripeCustomerId) return jsonResponse({ ok: false, error: 'no_card_on_file' }, 409);

  let paymentIntentId: string | null = null;
  try {
    const pi = await stripeForm('payment_intents', {
      amount: String(reqRow.amount_cents),
      currency: 'usd',
      customer: stripeCustomerId,
      confirm: 'true',
      off_session: 'true',
      description: `Tidy add-on — ${reqRow.addon_name}`,
      'metadata[addon_request_id]': reqRow.id,
      'metadata[job_id]': reqRow.job_id,
      'metadata[addon_key]': reqRow.addon_key ?? '',
      'metadata[source]': 'walkaround_addon',
    });
    if (pi?.status !== 'succeeded') throw new Error(`payment_${pi?.status ?? 'unknown'}`);
    paymentIntentId = pi.id as string;
  } catch (e) {
    const detail = (e as Error).message;
    console.error('[addon-request-respond] charge failed', detail);
    await admin.from('admin_alerts').insert({
      alert_type: 'addon_charge_failed',
      title: `Add-on approved but card failed — ${reqRow.addon_name}`,
      body: `Job ${reqRow.job_id}. The customer approved and the charge failed: ${detail}`,
      context: { addon_request_id: reqRow.id, job_id: reqRow.job_id },
    });
    return jsonResponse({ ok: false, error: 'payment_failed', detail }, 402);
  }

  const share = TIER_SHARE[(pro?.tier as string) ?? 'tier_1_verified'] ?? 0.4;
  const proPayCents = Math.round(reqRow.amount_cents * share);

  const { data: claimed } = await admin
    .from('addon_requests')
    .update({
      status: 'approved',
      responded_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
      pro_pay_cents: proPayCents,
    })
    .eq('id', reqRow.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (!claimed) {
    // Extremely unlikely: resolved between the charge and the write. Leave a
    // trail rather than double-paying the Pro.
    await admin.from('admin_alerts').insert({
      alert_type: 'addon_charge_orphaned',
      title: 'Add-on charged after request was resolved',
      body: `PaymentIntent ${paymentIntentId} on request ${reqRow.id} may need a refund.`,
      context: { addon_request_id: reqRow.id, payment_intent: paymentIntentId },
    });
    return jsonResponse({ ok: false, error: 'already_resolved' }, 409);
  }

  if (reqRow.pro_visit_id) {
    const { data: pv } = await admin
      .from('pro_visits').select('addon_pay_cents').eq('id', reqRow.pro_visit_id).maybeSingle();
    await admin.from('pro_visits').update({
      addon_pay_cents: ((pv as { addon_pay_cents?: number } | null)?.addon_pay_cents ?? 0) + proPayCents,
    }).eq('id', reqRow.pro_visit_id);
  }

  await notifyPro(admin, {
    contractor_id: reqRow.pro_id,
    kind: 'addon_approved',
    title: `Approved — do the ${reqRow.addon_name}`,
    body: `Paid. $${(proPayCents / 100).toFixed(2)} added to your pay for this visit.`,
    url: `/pro/job/${reqRow.job_id}`,
    context: { addon_request_id: reqRow.id, job_id: reqRow.job_id, pro_pay_cents: proPayCents },
  });

  return jsonResponse({ ok: true, status: 'approved', pro_pay_cents: proPayCents });
});
