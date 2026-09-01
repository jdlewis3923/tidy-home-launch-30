// Tidy — referred customer's own $50 off (HALF 2 of the referral promise).
//
// /refer promises two things: "They get $50 off their first month" and "you get
// $50". The referrer's half lives in stripe-webhook (balance transaction on the
// referred customer's first paid invoice). THIS file is the referred friend's
// half — the coupon that gets attached to the checkout session.
//
// The coupon is a plain Stripe coupon, NOT a promotion code: $50.00 off, duration
// "once", no redemption limit and no expiry. There is nothing to run out.
//
// Every decision is validated server-side against public.profiles. A referral
// code from the request body is never trusted, and a bad code NEVER fails the
// checkout — it just yields no discount, with the reason logged.

/** The uncapped Stripe coupon: $50.00 off, once, no max_redemptions, no expiry. */
export const REFERRAL_COUPON_ID = "REFERRAL_50_OFF_FIRST_MONTH";

export type ReferralDiscountReason =
  | "no_code"
  | "unknown_code"
  | "self_referral"
  | "not_first_order"
  | "lookup_failed"
  | "applied";

export interface ReferralDiscountDecision {
  /** True only when the coupon should be attached to the Stripe session. */
  apply: boolean;
  /** Present only when apply is true. */
  coupon?: string;
  reason: ReferralDiscountReason;
  /** Normalized code, for metadata/logging. Empty when no code was supplied. */
  code: string;
  /** Resolved referrer, when the code matched a profile. */
  referrerUserId?: string;
}

/**
 * Decide whether the referred customer earns the $50-off-first-month coupon.
 *
 * Rules (all enforced server-side):
 *  1. The code must match a public.profiles.referral_code row.
 *  2. The resolved referrer must not be the customer checking out.
 *  3. The customer must have no paid invoice yet — "first month" means first.
 *
 * Never throws. Any failure degrades to "no discount, checkout proceeds".
 */
export async function resolveReferralDiscount(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  code: string | null | undefined;
  userId: string;
}): Promise<ReferralDiscountDecision> {
  const { supabase, code, userId } = opts;
  const normalized = (code ?? "").trim().toUpperCase();

  if (!normalized) return { apply: false, reason: "no_code", code: "" };

  try {
    const { data: referrer, error: refErr } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("referral_code", normalized)
      .maybeSingle();
    if (refErr) throw new Error(refErr.message);

    if (!referrer?.user_id) {
      return { apply: false, reason: "unknown_code", code: normalized };
    }
    if (referrer.user_id === userId) {
      return { apply: false, reason: "self_referral", code: normalized, referrerUserId: referrer.user_id };
    }

    const { data: paid, error: invErr } = await supabase
      .from("invoices")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "paid")
      .limit(1);
    if (invErr) throw new Error(invErr.message);

    if (paid && paid.length > 0) {
      return { apply: false, reason: "not_first_order", code: normalized, referrerUserId: referrer.user_id };
    }

    return {
      apply: true,
      coupon: REFERRAL_COUPON_ID,
      reason: "applied",
      code: normalized,
      referrerUserId: referrer.user_id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error(`[referral-discount] lookup failed for ${normalized}: ${message}`);
    return { apply: false, reason: "lookup_failed", code: normalized };
  }
}

/**
 * A silently missing discount is the defect this file exists to prevent, so
 * every outcome — applied or skipped — is logged with its reason.
 */
export async function logReferralDiscountDecision(opts: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  decision: ReferralDiscountDecision;
  userId: string;
  where: string;
}): Promise<void> {
  const { supabase, decision, userId, where } = opts;
  if (decision.reason === "no_code") return; // nothing to explain

  const line = `[referral-discount] ${where} user=${userId} code=${decision.code} → ${
    decision.apply ? `applied ${decision.coupon}` : `NO DISCOUNT (${decision.reason})`
  }`;
  if (decision.apply) console.log(line);
  else console.warn(line);

  try {
    await supabase.from("integration_logs").insert({
      source: "referral",
      event: `discount:${decision.reason}:${userId}`,
      status: decision.apply ? "success" : "skipped",
      payload_hash: decision.code || null,
      error_message: decision.apply ? null : `referral discount skipped: ${decision.reason}`,
    });
  } catch {
    // Logging must never break a checkout.
  }
}
