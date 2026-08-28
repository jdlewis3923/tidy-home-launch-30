// Tidy — customer referral attribution (HALF 1 of the referral credit flow).
//
// At checkout we capture which referral code the new customer used and write a
// pending row to public.referrals. The payout half lives in stripe-webhook and
// fires on the referred customer's FIRST paid invoice.
//
// Referral codes look like TIDY-XXXXX and live on public.profiles.referral_code.
// The referred customer's own $50 off comes from the Stripe coupon
// REFERRAL_50_OFF_FIRST_MONTH — nothing here touches that side.

import { REFERRAL_BONUS_CENTS } from "./pricing-canon.ts";

export const REFERRAL_CREDIT_CENTS = REFERRAL_BONUS_CENTS;

/** Resolve a Stripe customer id for a user: profile → subscription → Stripe search. */
// deno-lint-ignore no-explicit-any
export async function resolveStripeCustomerId(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  // deno-lint-ignore no-explicit-any
  stripe: any,
  userId: string,
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id as string;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sub?.stripe_customer_id) {
    await supabase.from("profiles").update({ stripe_customer_id: sub.stripe_customer_id }).eq("user_id", userId);
    return sub.stripe_customer_id as string;
  }

  try {
    const found = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
      limit: 1,
    });
    const cus = found.data[0]?.id ?? null;
    if (cus) {
      await supabase.from("profiles").update({ stripe_customer_id: cus }).eq("user_id", userId);
    }
    return cus;
  } catch (err) {
    console.error("[referral] stripe customer search failed", err);
    return null;
  }
}

/**
 * Record a pending referral for the referred customer. Safe to call with a
 * non-referral promo code (returns without writing). Never throws — checkout
 * must not fail because attribution failed.
 */
export async function recordReferralAttribution(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  // deno-lint-ignore no-explicit-any
  stripe: any;
  code: string | null | undefined;
  referredUserId: string;
  referredEmail: string | null | undefined;
  referredStripeCustomerId: string | null;
}): Promise<void> {
  const { supabase, stripe, code, referredUserId, referredEmail, referredStripeCustomerId } = opts;
  const normalized = (code ?? "").trim().toUpperCase();
  if (!normalized) return;

  try {
    const { data: referrer } = await supabase
      .from("profiles")
      .select("user_id, stripe_customer_id")
      .eq("referral_code", normalized)
      .maybeSingle();

    // Not a referral code (e.g. a plain marketing promo) or self-referral.
    if (!referrer?.user_id || referrer.user_id === referredUserId) return;

    // Persist the referred customer's Stripe id for later lookups.
    if (referredStripeCustomerId) {
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: referredStripeCustomerId })
        .eq("user_id", referredUserId);
    }

    const referrerCus =
      referrer.stripe_customer_id ?? (await resolveStripeCustomerId(supabase, stripe, referrer.user_id));

    const { error } = await supabase.from("referrals").upsert(
      {
        referrer_user_id: referrer.user_id,
        referrer_stripe_customer_id: referrerCus,
        referred_user_id: referredUserId,
        referred_stripe_customer_id: referredStripeCustomerId,
        referee_email: referredEmail ?? null,
        referral_code: normalized,
        credit_cents: REFERRAL_CREDIT_CENTS,
        status: "pending",
      },
      { onConflict: "referred_user_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);

    await supabase.from("integration_logs").insert({
      source: "referral",
      event: `attribution:${referredUserId}`,
      status: "success",
      payload_hash: normalized,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[referral] attribution failed", message);
    await supabase
      .from("integration_logs")
      .insert({
        source: "referral",
        event: `attribution:${referredUserId}`,
        status: "error",
        error_message: message.slice(0, 1000),
      })
      .then(() => {}, () => {});
  }
}
