import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — admin-stripe-test-run.
//
// Proves the money lifecycle against STRIPE TEST MODE using our own catalog
// prices: create a throwaway customer, subscribe it to a real catalog price
// (test twin), confirm the first invoice is PAID, issue a partial refund,
// cancel, and delete the customer. Nothing live is touched — the test secret
// key is used explicitly and its value is never logged or returned.
//
// Admin-only. Body: { lookup_key?: string } — defaults to clean_2_biweekly.

import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const testKey = Deno.env.get('STRIPE_TEST_SECRET_KEY');
  if (!testKey) return jsonResponse({ ok: false, error: 'stripe_test_key_not_configured' }, 500);
  if (!testKey.startsWith('sk_test_')) {
    return jsonResponse({ ok: false, error: 'stripe_test_key_is_not_test_mode' }, 500);
  }

  let lookupKey = 'clean_2_biweekly';
  try {
    const body = await req.json();
    if (body?.lookup_key) lookupKey = String(body.lookup_key);
  } catch { /* empty body is fine */ }
  if (!/^[a-z0-9_]+$/.test(lookupKey)) {
    return jsonResponse({ ok: false, error: 'invalid_lookup_key' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: catalogRow, error: catErr } = await supabase
    .from('stripe_catalog')
    .select('canon_key, stripe_price_id_test, price_cents')
    .eq('canon_key', lookupKey)
    .eq('active', true)
    .maybeSingle();
  if (catErr) return jsonResponse({ ok: false, error: `catalog_read_failed:${catErr.message}` }, 500);
  if (!catalogRow?.stripe_price_id_test) {
    return jsonResponse({ ok: false, error: 'no_test_price_for_lookup_key', lookup_key: lookupKey }, 404);
  }

  const stripe = new Stripe(testKey, {
    apiVersion: '2024-12-18.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });

  const stamp = Date.now();
  let customerId: string | null = null;
  let subscriptionId: string | null = null;
  const steps: Record<string, unknown> = { lookup_key: lookupKey, price_id: catalogRow.stripe_price_id_test };

  try {
    // 1. Throwaway customer with a test card.
    const customer = await stripe.customers.create({
      email: `tidy-lifecycle-test-${stamp}@example.com`,
      name: 'Tidy Lifecycle Test (delete me)',
      payment_method: 'pm_card_visa',
      invoice_settings: { default_payment_method: 'pm_card_visa' },
    });
    customerId = customer.id;

    // 2. Subscribe to the real catalog price; pay the first invoice at once.
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: catalogRow.stripe_price_id_test, quantity: 1 }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
    subscriptionId = subscription.id;

    // deno-lint-ignore no-explicit-any
    let invoice = subscription.latest_invoice as any;
    // deno-lint-ignore no-explicit-any
    let paymentIntent = invoice?.payment_intent as any;
    // Test-mode cards still need an explicit confirmation on the first invoice.
    if (paymentIntent?.status === 'requires_confirmation') {
      paymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id, { payment_method: 'pm_card_visa' });
      invoice = await stripe.invoices.retrieve(invoice.id);
    }
    const paidCents = typeof invoice?.amount_paid === 'number' ? invoice.amount_paid : null;
    const subAfter = await stripe.subscriptions.retrieve(subscription.id);
    steps.charge = {
      subscription_status: subAfter.status,
      invoice_status: invoice?.status ?? null,
      amount_paid_cents: paidCents,
      expected_cents: catalogRow.price_cents,
      charge_succeeded: subAfter.status === 'active' && invoice?.status === 'paid' && paidCents === catalogRow.price_cents,
      payment_intent_status: paymentIntent?.status ?? null,
    };

    // 3. Partial refund of the first charge ($1.00) — proves the refund path.
    const chargeId = typeof paymentIntent?.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent?.id
        ? (await stripe.paymentIntents.retrieve(paymentIntent.id)).latest_charge
        : null;
    if (chargeId && typeof chargeId === 'string') {
      const refund = await stripe.refunds.create({ charge: chargeId, amount: 100 });
      steps.refund = { refund_status: refund.status, refunded_cents: refund.amount, refund_ok: refund.status === 'succeeded' && refund.amount === 100 };
    } else {
      steps.refund = { refund_ok: false, reason: 'no_charge_found' };
    }

    // 4. Cancel immediately, then delete the customer.
    await stripe.subscriptions.cancel(subscription.id);
    steps.cancel = { canceled: true };

    await stripe.customers.del(customer.id);
    steps.cleanup = { customer_deleted: true };
    customerId = null;

    const ok = (steps.charge as { charge_succeeded?: boolean }).charge_succeeded === true &&
      (steps.refund as { refund_ok?: boolean }).refund_ok === true;
    return jsonResponse({ ok, mode: 'test', steps }, ok ? 200 : 502);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    // Best-effort cleanup so no test artifacts linger.
    try { if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId); } catch { /* ignore */ }
    try { if (customerId) await stripe.customers.del(customerId); } catch { /* ignore */ }
    return jsonResponse({ ok: false, mode: 'test', error: message, steps }, 500);
  }
});
