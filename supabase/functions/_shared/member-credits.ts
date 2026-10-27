// Tidy — shared member credit applier.
//
// A credit row in public.member_credits is the promise; this applies it to the
// member's Stripe customer balance (a negative balance transaction comes off
// the next invoice automatically) and marks the row applied. Used by
// customer-skip-visit (immediate) and member-ops-tick (retry of pending rows).

import type Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';

// deno-lint-ignore no-explicit-any
export async function applyMemberCredit(
  stripe: Stripe,
  supabase: any,
  credit: { id: string; user_id: string; amount_cents: number; kind: string; note: string | null },
): Promise<{ applied: boolean; error?: string }> {
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', credit.user_id)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) return { applied: false, error: subErr.message };
  if (!sub?.stripe_customer_id) return { applied: false, error: 'no_stripe_customer' };

  try {
    const txn = await stripe.customers.createBalanceTransaction(sub.stripe_customer_id, {
      amount: -Math.abs(credit.amount_cents),
      currency: 'usd',
      description: `Tidy credit — ${credit.kind}${credit.note ? `: ${credit.note}` : ''}`,
      metadata: { member_credit_id: credit.id, kind: credit.kind },
    });
    const { error: upErr } = await supabase
      .from('member_credits')
      .update({ status: 'applied', applied_at: new Date().toISOString(), stripe_balance_transaction_id: txn.id })
      .eq('id', credit.id)
      .eq('status', 'pending');
    if (upErr) return { applied: false, error: upErr.message };
    return { applied: true };
  } catch (err) {
    return { applied: false, error: err instanceof Error ? err.message : 'stripe_error' };
  }
}
