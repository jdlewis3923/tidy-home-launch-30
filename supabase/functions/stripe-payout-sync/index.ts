// stripe-payout-sync — Stripe webhook listener for payout events. Captures the
// payout amount, routes it to the connected contractor via the Stripe account
// metadata.contractor_id, and stamps stripe_payouts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
import { handleCors, jsonResponse, corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SIGNING = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (!STRIPE_KEY) return jsonResponse({ ok: false, skipped: 'STRIPE_SECRET_KEY missing' }, 503);

  const stripe = new Stripe(STRIPE_KEY, { apiVersion: '2024-06-20' });
  const sig = req.headers.get('stripe-signature') ?? '';
  const raw = await req.text();

  let evt: Stripe.Event;
  try {
    evt = SIGNING
      ? await stripe.webhooks.constructEventAsync(raw, sig, SIGNING)
      : (JSON.parse(raw) as Stripe.Event);
  } catch (err) {
    return new Response(`bad signature: ${(err as Error).message}`, { status: 400, headers: corsHeaders });
  }

  if (!['payout.paid', 'payout.created', 'transfer.created', 'transfer.paid'].includes(evt.type)) {
    return jsonResponse({ ok: true, ignored: evt.type });
  }

  const obj = evt.data.object as any;
  const acctId = (evt.account as string) ?? obj?.destination ?? null;
  if (!acctId) return jsonResponse({ ok: true, skipped: 'no account' });

  // Look up contractor from Stripe Connect metadata
  let contractorId: string | null = null;
  try {
    const acct = await stripe.accounts.retrieve(acctId);
    contractorId = (acct.metadata?.contractor_id as string | undefined) ?? null;
  } catch (_) { /* ignore */ }
  if (!contractorId) return jsonResponse({ ok: true, skipped: 'no contractor metadata' });

  const isTransfer = evt.type.startsWith('transfer');
  const payoutId = obj.id as string;
  const cents = Number(obj.amount ?? 0);
  const status = (obj.status as string) ?? 'paid';

  await admin.from('stripe_payouts').upsert({
    contractor_id: contractorId,
    [isTransfer ? 'stripe_transfer_id' : 'stripe_transfer_id']: payoutId,
    amount_cents: cents,
    currency: obj.currency ?? 'usd',
    status,
    scheduled_at: obj.created ? new Date(obj.created * 1000).toISOString() : new Date().toISOString(),
    paid_at: status === 'paid' ? new Date().toISOString() : null,
    week_ending_date: new Date().toISOString().slice(0, 10),
  }, { onConflict: 'stripe_transfer_id' });

  return jsonResponse({ ok: true, contractor_id: contractorId, cents });
});
