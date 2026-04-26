// Tidy — Stripe Webhook Handler
//
// Verifies Stripe signature using STRIPE_WEBHOOK_SECRET, enforces
// idempotency through integration_logs (source='stripe', event=evt.id),
// then dispatches by event type. All DB writes use service role.
//
// Always returns 200 unless signature verification fails (400) — Stripe
// retries on non-2xx, and we want to swallow downstream errors after the
// log row is recorded so retries don't double-process.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FREQ_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

function timeWindowFromPreferred(pref: string | null | undefined): string {
  if (pref === 'morning') return '8:00 AM – 12:00 PM';
  if (pref === 'afternoon') return '12:00 PM – 5:00 PM';
  return '9:00 AM – 1:00 PM';
}

function nextVisitDate(preferredDay: string | null | undefined): Date {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = new Date();
  if (preferredDay) {
    const idx = days.indexOf(preferredDay);
    if (idx >= 0) {
      const dow = today.getDay();
      let add = (idx - dow + 7) % 7;
      if (add < 2) add += 7;
      return new Date(today.getTime() + add * 86_400_000);
    }
  }
  return new Date(today.getTime() + 5 * 86_400_000);
}

async function fireZap(eventName: string, payload: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-zapier-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ event_name: eventName, payload }),
    });
  } catch (err) {
    console.error('[stripe-webhook] zap dispatch failed', eventName, err);
  }
}

/**
 * Fire-and-log call into a Jobber edge function. We do not block the
 * Stripe ack on Jobber success — failures are recorded in
 * integration_logs and surfaced via /admin/health.
 */
async function callJobberFn(fn: 'jobber-sync-customer' | 'jobber-create-job', body: unknown) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[stripe-webhook] ${fn} failed`, res.status, text.slice(0, 200));
    }
  } catch (err) {
    console.error(`[stripe-webhook] ${fn} dispatch threw`, err);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok');
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing');
    return new Response('not configured', { status: 503 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });

  const rawBody = await req.text();
  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verify failed';
    console.error('[stripe-webhook] signature verification failed', msg);
    return new Response(`signature verification failed: ${msg}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- Idempotency guard via integration_logs ----------
  // event=event.id is unique per Stripe delivery. If we've seen it, ack.
  const { data: existing } = await supabase
    .from('integration_logs')
    .select('id')
    .eq('source', 'stripe')
    .eq('event', event.id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return new Response('replay', { status: 200 });
  }

  const start = performance.now();

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripe, supabase, event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(supabase, event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(supabase, event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event);
        break;
      default:
        // Ignore unhandled types but still log them.
        break;
    }

    await supabase.from('integration_logs').insert({
      source: 'stripe',
      event: event.id,
      status: 'success',
      latency_ms: Math.round(performance.now() - start),
      payload_hash: event.type,
    });

    return new Response('ok', { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[stripe-webhook] handler failed', event.type, message);
    await supabase.from('integration_logs').insert({
      source: 'stripe',
      event: event.id,
      status: 'error',
      latency_ms: Math.round(performance.now() - start),
      payload_hash: event.type,
      error_message: message.slice(0, 1000),
    });
    // Always ack so Stripe doesn't retry into a poisoned state.
    return new Response('ok', { status: 200 });
  }
});

// ---------- Handlers ----------

// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(stripe: Stripe, supabase: any, event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const meta = session.metadata ?? {};
  const userId = meta.user_id;
  if (!userId) {
    console.error('[stripe-webhook] checkout.session.completed missing user_id metadata');
    return;
  }

  const services: Array<{ service: 'cleaning' | 'lawn' | 'detailing'; frequency: 'monthly' | 'biweekly' | 'weekly' }> =
    meta.services_json ? JSON.parse(meta.services_json) : [];
  if (services.length === 0) return;

  // Dominant frequency for the subscription row.
  const freqs = services.map((s) => s.frequency);
  const dominantFrequency: 'weekly' | 'biweekly' | 'monthly' =
    freqs.includes('weekly') ? 'weekly' : freqs.includes('biweekly') ? 'biweekly' : 'monthly';

  // Pull the actual subscription from Stripe to get the canonical IDs + period end.
  const stripeSubscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;
  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  let nextBillingDate: string | null = null;
  let monthlyTotalCents = 0;
  if (stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (sub.current_period_end) {
      nextBillingDate = new Date(sub.current_period_end * 1000).toISOString().slice(0, 10);
    }
    // Sum recurring item amounts (per-period amount in cents).
    for (const item of sub.items.data) {
      const amt = item.price.unit_amount ?? 0;
      monthlyTotalCents += amt * (item.quantity ?? 1);
    }
  }

  const bundleDiscountPct = parseInt(meta.bundle_discount_pct ?? '0', 10) || 0;

  // Insert one subscription row with services as array.
  const { data: subRow, error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      services: services.map((s) => s.service),
      frequency: dominantFrequency,
      monthly_total_cents: monthlyTotalCents,
      status: 'active',
      stripe_subscription_id: stripeSubscriptionId,
      stripe_customer_id: stripeCustomerId,
      next_billing_date: nextBillingDate,
      bundle_discount_pct: bundleDiscountPct,
    })
    .select('id')
    .single();

  if (subErr || !subRow) {
    throw new Error(`subscriptions insert failed: ${subErr?.message ?? 'no row returned'}`);
  }

  // Seed first 3 visits per service.
  const baseDate = nextVisitDate(meta.preferred_day);
  // deno-lint-ignore no-explicit-any
  const visits: any[] = [];
  for (const s of services) {
    const spacing = FREQ_DAYS[s.frequency] ?? 30;
    for (let i = 0; i < 3; i++) {
      const d = new Date(baseDate.getTime() + i * spacing * 86_400_000);
      visits.push({
        user_id: userId,
        subscription_id: subRow.id,
        service: s.service,
        visit_date: d.toISOString().slice(0, 10),
        time_window: timeWindowFromPreferred(meta.preferred_time),
        status: 'scheduled',
      });
    }
  }

  if (visits.length > 0) {
    const { error: visitErr } = await supabase.from('visits').insert(visits);
    if (visitErr) {
      console.error('[stripe-webhook] visits insert failed', visitErr.message);
    }
  }

  await fireZap('subscription_confirmed', {
    user_id: userId,
    subscription_id: subRow.id,
    stripe_subscription_id: stripeSubscriptionId,
    services: services.map((s) => s.service),
    frequency: dominantFrequency,
    monthly_total_cents: monthlyTotalCents,
    zip: meta.zip,
    lang: meta.lang,
    preferred_day: meta.preferred_day,
    preferred_time: meta.preferred_time,
  });

  // Phase 3 — Jobber field-service sync. Sequential: client must exist
  // before we can attach jobs. Both calls log to integration_logs and
  // never throw out of this handler so Stripe still gets its 200.
  await callJobberFn('jobber-sync-customer', {
    user_id: userId,
    subscription_id: subRow.id,
  });
  await callJobberFn('jobber-create-job', {
    subscription_id: subRow.id,
  });
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaid(supabase: any, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id ?? null;

  // Find local subscription to grab user_id + subscription FK.
  let userId: string | null = null;
  let localSubId: string | null = null;
  if (stripeSubId) {
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('id, user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();
    userId = subRow?.user_id ?? null;
    localSubId = subRow?.id ?? null;
  }

  if (!userId) {
    console.warn('[stripe-webhook] invoice.paid: no local subscription found for', stripeSubId);
    return;
  }

  await supabase
    .from('invoices')
    .upsert(
      {
        user_id: userId,
        subscription_id: localSubId,
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amount_paid ?? 0,
        status: 'paid',
        invoice_date: new Date((invoice.created ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
        receipt_url: invoice.hosted_invoice_url ?? null,
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'stripe_invoice_id' },
    );

  // Push next_billing_date forward.
  if (localSubId && invoice.lines?.data?.[0]?.period?.end) {
    const next = new Date(invoice.lines.data[0].period.end * 1000).toISOString().slice(0, 10);
    await supabase
      .from('subscriptions')
      .update({ next_billing_date: next })
      .eq('id', localSubId);
  }
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentFailed(supabase: any, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id ?? null;

  let userId: string | null = null;
  let localSubId: string | null = null;
  if (stripeSubId) {
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('id, user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();
    userId = subRow?.user_id ?? null;
    localSubId = subRow?.id ?? null;
  }

  if (!userId) return;

  await supabase
    .from('invoices')
    .upsert(
      {
        user_id: userId,
        subscription_id: localSubId,
        stripe_invoice_id: invoice.id,
        amount_cents: invoice.amount_due ?? 0,
        status: 'failed',
        invoice_date: new Date((invoice.created ?? Date.now() / 1000) * 1000).toISOString().slice(0, 10),
        receipt_url: invoice.hosted_invoice_url ?? null,
      },
      { onConflict: 'stripe_invoice_id' },
    );

  await fireZap('payment_failed', {
    user_id: userId,
    stripe_subscription_id: stripeSubId,
    stripe_invoice_id: invoice.id,
    amount_cents: invoice.amount_due ?? 0,
    hosted_invoice_url: invoice.hosted_invoice_url,
  });
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionUpdated(supabase: any, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const status: 'active' | 'paused' | 'canceled' =
    sub.status === 'active' || sub.status === 'trialing'
      ? 'active'
      : sub.status === 'paused'
        ? 'paused'
        : sub.status === 'canceled' || sub.status === 'incomplete_expired'
          ? 'canceled'
          : 'active';

  const next = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString().slice(0, 10)
    : null;

  await supabase
    .from('subscriptions')
    .update({
      status,
      next_billing_date: next,
    })
    .eq('stripe_subscription_id', sub.id);
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionDeleted(supabase: any, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  await supabase
    .from('subscriptions')
    .update({ status: 'canceled' })
    .eq('stripe_subscription_id', sub.id);
}
