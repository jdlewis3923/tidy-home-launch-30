import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { stripeSecretKey } from './stripe-mode.ts';

/** The reward is earned on completion, never on a checkout or invoice. */
export async function creditFirstVisitReferral(admin: any, userId: string): Promise<void> {
  const { data: contact } = await admin.from('contacts').select('is_test').eq('user_id', userId).maybeSingle();
  if (contact?.is_test) return;
  const { data: referral } = await admin.from('referrals').select('*').eq('referred_user_id', userId).eq('status', 'pending').maybeSingle();
  if (!referral) return;
  const { count } = await admin.from('visits').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'complete').eq('is_sample', false).eq('is_redo', false);
  if (!count) return;
  const key = stripeSecretKey(); if (!key) return;
  let customer = referral.referrer_stripe_customer_id;
  if (!customer) {
    const { data: sub } = await admin.from('subscriptions').select('stripe_customer_id').eq('user_id', referral.referrer_user_id).not('stripe_customer_id', 'is', null).order('created_at').limit(1).maybeSingle();
    customer = sub?.stripe_customer_id;
  }
  if (!customer) return;
  try {
    const stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
    const credit = await stripe.customers.createBalanceTransaction(customer, { amount: -5000, currency: 'usd', description: 'Tidy referral — first visit completed', metadata: { referral_id: referral.id } }, { idempotencyKey: `referral-credit:${referral.id}` });
    const { error } = await admin.from('referrals').update({ status: 'credited', credit_cents: 5000, stripe_credit_id: credit.id, credited_at: new Date().toISOString(), error_message: null }).eq('id', referral.id).eq('status', 'pending');
    if (error) throw error;
  } catch (error) {
    await admin.from('referrals').update({ error_message: error instanceof Error ? error.message : 'credit failed' }).eq('id', referral.id);
  }
}