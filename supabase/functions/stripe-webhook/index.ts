// Tidy — Stripe Webhook Handler (full lifecycle + dunning)
//
// Verifies Stripe signature using STRIPE_WEBHOOK_SECRET, then enforces
// idempotency through public.stripe_events (unique on stripe_event_id).
// All DB writes use service role.
//
// Always returns 200 unless signature verification fails (400). Stripe
// retries on non-2xx — we want to swallow downstream errors after the
// idempotency row is written so retries don't double-process.
//
// Event coverage:
//   checkout.session.completed         → seed subscription + visits (legacy redirect Checkout)
//   customer.subscription.created      → seed subscription + visits (embedded Payment Element flow)
//   customer.subscription.updated      → status, pause_collection, cancel_at_period_end
//   customer.subscription.deleted      → mark canceled
//   invoice.paid                       → record invoice, push next_billing_date, capture card
//   invoice.payment_failed             → dunning ladder (1st/2nd → recovery, 3rd → mark uncollectible + pause)
//   invoice.payment_action_required    → SCA notice via Zap
//   payment_method.attached            → card details refresh + auto-unpause if paused
//
// Dunning thresholds keyed off invoice.attempt_count (1-indexed).

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const FREQ_DAYS: Record<string, number> = { weekly: 7, biweekly: 14, monthly: 30 };

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
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'verify failed';
    console.error('[stripe-webhook] signature verification failed', msg);
    return new Response(`signature verification failed: ${msg}`, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------- Idempotency: stripe_events table (unique on stripe_event_id) ----------
  const { data: insertedEvt, error: insErr } = await supabase
    .from('stripe_events')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      livemode: event.livemode,
      status: 'received',
      payload_summary: { type: event.type, livemode: event.livemode },
    })
    .select('id')
    .maybeSingle();

  if (insErr) {
    // Unique violation (23505) → we've seen this event. Ack happily.
    if ((insErr as { code?: string }).code === '23505') {
      return new Response('replay', { status: 200 });
    }
    console.error('[stripe-webhook] idempotency insert failed', insErr.message);
    // Fall through and try to process anyway.
  }

  const eventRowId: string | null = insertedEvt?.id ?? null;
  const start = performance.now();

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripe, supabase, event);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(stripe, supabase, event);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(supabase, event);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(stripe, supabase, event);
        break;
      case 'invoice.payment_action_required':
        await handleInvoicePaymentActionRequired(supabase, event);
        break;
      case 'payment_method.attached':
        await handlePaymentMethodAttached(stripe, supabase, event);
        break;
      case 'customer.updated':
        // No-op for now; reserved for future profile sync.
        break;
      default:
        break;
    }

    const duration = Math.round(performance.now() - start);
    if (eventRowId) {
      await supabase
        .from('stripe_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), duration_ms: duration })
        .eq('id', eventRowId);
    }
    // Mirror to integration_logs for /admin/health rollups (non-fatal).
    await supabase.from('integration_logs').insert({
      source: 'stripe', event: event.id, status: 'success',
      latency_ms: duration, payload_hash: event.type,
    });

    return new Response('ok', { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    const duration = Math.round(performance.now() - start);
    console.error('[stripe-webhook] handler failed', event.type, message);
    if (eventRowId) {
      await supabase
        .from('stripe_events')
        .update({ status: 'error', error_message: message.slice(0, 1000), duration_ms: duration })
        .eq('id', eventRowId);
    }
    await supabase.from('integration_logs').insert({
      source: 'stripe', event: event.id, status: 'error',
      latency_ms: duration, payload_hash: event.type, error_message: message.slice(0, 1000),
    });
    // Always ack so Stripe doesn't retry into a poisoned state.
    return new Response('ok', { status: 200 });
  }
});

// =====================================================================
// Shared seed routine — used by both checkout.session.completed (legacy)
// and customer.subscription.created (embedded Payment Element).
// =====================================================================

// deno-lint-ignore no-explicit-any
async function seedSubscriptionAndVisits(stripe: Stripe, supabase: any, opts: {
  userId: string;
  meta: Record<string, string>;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
}) {
  const { userId, meta, stripeSubscriptionId, stripeCustomerId } = opts;

  // Skip if we've already seeded for this Stripe subscription.
  if (stripeSubscriptionId) {
    const { data: dup } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('stripe_subscription_id', stripeSubscriptionId)
      .maybeSingle();
    if (dup) return;
  }

  const services: Array<{ service: 'cleaning' | 'lawn' | 'detailing'; frequency: 'monthly' | 'biweekly' | 'weekly' }> =
    meta.services_json ? JSON.parse(meta.services_json) : [];
  if (services.length === 0) {
    console.warn('[stripe-webhook] seed skipped — no services_json in metadata for', stripeSubscriptionId);
    return;
  }

  const freqs = services.map((s) => s.frequency);
  const dominantFrequency: 'weekly' | 'biweekly' | 'monthly' =
    freqs.includes('weekly') ? 'weekly' : freqs.includes('biweekly') ? 'biweekly' : 'monthly';

  let nextBillingDate: string | null = null;
  let monthlyTotalCents = 0;
  if (stripeSubscriptionId) {
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    if (sub.current_period_end) {
      nextBillingDate = new Date(sub.current_period_end * 1000).toISOString().slice(0, 10);
    }
    for (const item of sub.items.data) {
      const amt = item.price.unit_amount ?? 0;
      monthlyTotalCents += amt * (item.quantity ?? 1);
    }
  }

  const bundleDiscountPct = parseInt(meta.bundle_discount_pct ?? '0', 10) || 0;

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

  // Mirror service_tier + signup_source onto profile (best-effort).
  const dominantService = services[0]?.service ?? null;
  if (dominantService) {
    await supabase
      .from('profiles')
      .update({
        service_tier: dominantService,
        signup_source: meta.signup_source || null,
      })
      .eq('user_id', userId);
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
    if (visitErr) console.error('[stripe-webhook] visits insert failed', visitErr.message);
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

  await callJobberFn('jobber-sync-customer', { user_id: userId, subscription_id: subRow.id });
  await callJobberFn('jobber-create-job', { subscription_id: subRow.id });
}

// =====================================================================
// Handlers
// =====================================================================

// deno-lint-ignore no-explicit-any
async function handleCheckoutCompleted(stripe: Stripe, supabase: any, event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const meta = (session.metadata ?? {}) as Record<string, string>;
  const userId = meta.user_id;
  if (!userId) {
    console.error('[stripe-webhook] checkout.session.completed missing user_id metadata');
    return;
  }
  const stripeSubscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id ?? null;
  const stripeCustomerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id ?? null;

  await seedSubscriptionAndVisits(stripe, supabase, {
    userId, meta, stripeSubscriptionId, stripeCustomerId,
  });
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionCreated(stripe: Stripe, supabase: any, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const meta = (sub.metadata ?? {}) as Record<string, string>;
  const userId = meta.user_id;
  if (!userId) {
    // Could be a subscription created via legacy Checkout; that path is
    // handled by checkout.session.completed. Skip silently.
    return;
  }
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id ?? null;
  await seedSubscriptionAndVisits(stripe, supabase, {
    userId, meta, stripeSubscriptionId: sub.id, stripeCustomerId,
  });
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaid(supabase: any, event: Stripe.Event) {
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

  // Reset attempt count + clear any pause on successful payment.
  if (localSubId) {
    const updates: Record<string, unknown> = { latest_invoice_attempt_count: 0 };
    if (invoice.lines?.data?.[0]?.period?.end) {
      updates.next_billing_date = new Date(invoice.lines.data[0].period.end * 1000).toISOString().slice(0, 10);
    }
    await supabase.from('subscriptions').update(updates).eq('id', localSubId);
  }

  // Capture card_brand + card_last4 for Billing UI display.
  try {
    const chargeId = (invoice as unknown as { charge?: string | { id: string } }).charge;
    const cid = typeof chargeId === 'string' ? chargeId : chargeId?.id ?? null;
    if (localSubId && cid) {
      const { default: StripeCtor } = await import('https://esm.sh/stripe@17.5.0?target=deno');
      const s = new StripeCtor(STRIPE_SECRET_KEY!, {
        apiVersion: '2024-12-18.acacia',
        httpClient: StripeCtor.createFetchHttpClient(),
      });
      const charge = await s.charges.retrieve(cid);
      const card = charge.payment_method_details?.card;
      if (card?.brand || card?.last4) {
        await supabase
          .from('subscriptions')
          .update({ card_brand: card.brand ?? null, card_last4: card.last4 ?? null })
          .eq('id', localSubId);
      }
    }
  } catch (err) {
    console.warn('[stripe-webhook] card details capture failed', err);
  }
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentFailed(stripe: Stripe, supabase: any, event: Stripe.Event) {
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

  const attemptCount = invoice.attempt_count ?? 1;

  await supabase.from('invoices').upsert(
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

  if (localSubId) {
    await supabase
      .from('subscriptions')
      .update({ latest_invoice_attempt_count: attemptCount })
      .eq('id', localSubId);
  }

  // Dunning ladder ----------------------------------------------------
  // 1st & 2nd failure → recovery (BL2)
  // 3rd+ failure → mark uncollectible + pause subscription (BL2-final)
  const isFinal = attemptCount >= 3;

  await fireZap(isFinal ? 'payment_failed_final' : 'payment_failed', {
    user_id: userId,
    stripe_subscription_id: stripeSubId,
    stripe_invoice_id: invoice.id,
    amount_cents: invoice.amount_due ?? 0,
    attempt_count: attemptCount,
    hosted_invoice_url: invoice.hosted_invoice_url,
    update_payment_url: invoice.hosted_invoice_url, // also a CTA target
  });

  if (isFinal && stripeSubId) {
    try {
      await stripe.subscriptions.update(stripeSubId, {
        pause_collection: { behavior: 'mark_uncollectible' },
      });
      if (localSubId) {
        await supabase
          .from('subscriptions')
          .update({ pause_collection: 'mark_uncollectible', status: 'paused' })
          .eq('id', localSubId);
      }
    } catch (err) {
      console.error('[stripe-webhook] pause_collection failed', err);
    }
  }
}

// deno-lint-ignore no-explicit-any
async function handleInvoicePaymentActionRequired(supabase: any, event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const stripeSubId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id ?? null;

  let userId: string | null = null;
  if (stripeSubId) {
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_subscription_id', stripeSubId)
      .maybeSingle();
    userId = subRow?.user_id ?? null;
  }
  if (!userId) return;

  await fireZap('payment_action_required', {
    user_id: userId,
    stripe_subscription_id: stripeSubId,
    stripe_invoice_id: invoice.id,
    hosted_invoice_url: invoice.hosted_invoice_url,
  });
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionUpdated(supabase: any, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const status: 'active' | 'paused' | 'canceled' =
    sub.status === 'active' || sub.status === 'trialing'
      ? (sub.pause_collection ? 'paused' : 'active')
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
      pause_collection: sub.pause_collection?.behavior ?? null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    })
    .eq('stripe_subscription_id', sub.id);
}

// deno-lint-ignore no-explicit-any
async function handleSubscriptionDeleted(supabase: any, event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id);
}

// deno-lint-ignore no-explicit-any
async function handlePaymentMethodAttached(stripe: Stripe, supabase: any, event: Stripe.Event) {
  const pm = event.data.object as Stripe.PaymentMethod;
  const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id ?? null;
  if (!customerId) return;

  // Find local subs on this customer and refresh card preview.
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('id, stripe_subscription_id, pause_collection, status')
    .eq('stripe_customer_id', customerId);

  if (!subs?.length) return;

  for (const row of subs) {
    if (pm.card?.brand || pm.card?.last4) {
      await supabase
        .from('subscriptions')
        .update({ card_brand: pm.card.brand ?? null, card_last4: pm.card.last4 ?? null })
        .eq('id', row.id);
    }
    // Reactivation: if Stripe paused us due to dunning, unpause now that
    // the customer added a fresh card. Stripe will auto-retry the open invoice.
    if (row.pause_collection === 'mark_uncollectible' && row.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(row.stripe_subscription_id, { pause_collection: '' });
        await supabase
          .from('subscriptions')
          .update({ pause_collection: null, status: 'active' })
          .eq('id', row.id);
      } catch (err) {
        console.error('[stripe-webhook] auto-unpause failed', err);
      }
    }
  }
}
