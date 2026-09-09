/**
 * referral-bonus-check
 *
 * Daily cron (x-cron-key) or an authenticated admin. For each pro_referrals
 * row whose referee has completed >= 10 visits and whose bonus is unpaid,
 * transfers the referral bonus to the referrer's Stripe Connect account and
 * marks the row paid.
 *
 * Money rules (same pattern as review-bonus-payout):
 *   - A row is marked 'paid' ONLY with the transfer id from a successful
 *     transfer. The database also enforces this: pro_referrals.status = 'paid'
 *     requires stripe_transfer_id (CHECK pro_referrals_paid_requires_transfer).
 *   - Stripe Idempotency-Key = `${referral_id}:referral_bonus`, so two
 *     overlapping runs or a retry cannot transfer twice.
 *   - The update is guarded by `.is('bonus_paid_at', null)`, so a row is only
 *     ever moved to paid once.
 *   - No connected account / onboarding incomplete → status 'blocked' with a
 *     reason. The applicants trigger flips it back to 'pending' the moment
 *     Connect onboarding completes, and this run also retries blocked rows.
 *
 * The referrer's account is read from applicants.stripe_account_id +
 * stripe_connect_complete — never from stripe_payouts, which a Pro who has not
 * been paid yet does not have.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isCronAuthorized } from "../_shared/cron-auth.ts";
import { isValidStripeSecretKey, stripeSecretKeyError } from "../_shared/stripe-keys.ts";
import { REFERRAL_BONUS_CENTS } from "../_shared/pricing-canon.ts";
import { vendorFetch } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE_CONNECT_API_KEY = Deno.env.get("STRIPE_CONNECT_API_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const REFERRAL_THRESHOLD_VISITS = 10;
const BLOCKED_REASON = "blocked — referrer's Connect onboarding incomplete.";

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function isAdminRequest(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return false;
    const { data } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

async function stripeTransfer(destination: string, amountCents: number, description: string, idempotencyKey: string) {
  const body = new URLSearchParams({
    amount: String(amountCents),
    currency: "usd",
    destination,
    description,
    "metadata[reason]": "referral_bonus",
  }).toString();
  const res = await vendorFetch("https://api.stripe.com/v1/transfers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_CONNECT_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Idempotency-Key": idempotencyKey,
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message ?? `stripe transfer failed (${res.status})`);
  return json as { id: string };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const authorized = (await isCronAuthorized(req)) || (await isAdminRequest(req));
  if (!authorized) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  if (!isValidStripeSecretKey(STRIPE_CONNECT_API_KEY)) {
    const { reason } = stripeSecretKeyError("STRIPE_CONNECT_API_KEY");
    return jsonResponse({ ok: false, error: "stripe_connect_invalid_key", reason }, 503);
  }

  // Single source of truth for the bonus amount.
  const { data: setting } = await admin
    .from("app_settings").select("value").eq("key", "referral_bonus_amount_cents").maybeSingle();
  const bonusCents = Number(setting?.value ?? REFERRAL_BONUS_CENTS) || REFERRAL_BONUS_CENTS;

  const { data: pending, error } = await admin
    .from("pro_referrals")
    .select("id, referrer_contractor_id, referee_contractor_id, status")
    .is("bonus_paid_at", null)
    .in("status", ["pending", "completed", "earned", "blocked"])
    .limit(500);
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  let paid = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of pending ?? []) {
    if (!row.referee_contractor_id) { results.push({ id: row.id, skipped: "no_referee" }); continue; }

    const { count } = await admin
      .from("visits")
      .select("id", { count: "exact", head: true })
      .eq("assigned_pro_id", row.referee_contractor_id)
      .eq("status", "complete");
    if ((count ?? 0) < REFERRAL_THRESHOLD_VISITS) {
      results.push({ id: row.id, skipped: "below_threshold", visits: count ?? 0 });
      continue;
    }

    const { data: referrer } = await admin
      .from("applicants")
      .select("id, stripe_account_id, stripe_connect_complete")
      .eq("contractor_id", row.referrer_contractor_id)
      .maybeSingle();

    if (!referrer?.stripe_account_id || !referrer.stripe_connect_complete) {
      await admin.from("pro_referrals")
        .update({ status: "blocked", blocked_reason: BLOCKED_REASON })
        .eq("id", row.id)
        .is("bonus_paid_at", null);
      results.push({ id: row.id, status: "blocked", reason: BLOCKED_REASON });
      continue;
    }

    const idempotencyKey = `${row.id}:referral_bonus`;
    try {
      const transfer = await stripeTransfer(
        referrer.stripe_account_id, bonusCents,
        `Tidy referral bonus (${REFERRAL_THRESHOLD_VISITS} visits)`, idempotencyKey,
      );
      const paidAt = new Date().toISOString();
      const { data: updated } = await admin
        .from("pro_referrals")
        .update({ status: "paid", bonus_paid_at: paidAt, bonus_cents: bonusCents, stripe_transfer_id: transfer.id, blocked_reason: null })
        .eq("id", row.id)
        .is("bonus_paid_at", null)
        .select("id");
      paid += updated?.length ?? 0;
      results.push({ id: row.id, status: "paid", bonusCents, transfer_id: transfer.id, rows: updated?.length ?? 0 });
      await admin.from("integration_logs").insert({
        source: "internal", event: `referral_bonus_payout:${row.id}`, status: "success",
        payload_hash: `transfer=${transfer.id} amount=${bonusCents}`,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ id: row.id, status: "error", reason: message });
      await admin.from("integration_logs").insert({
        source: "internal", event: `referral_bonus_payout:${row.id}`, status: "error",
        error_message: message.slice(0, 1000),
      });
    }
  }

  return jsonResponse({ ok: true, bonusCents, paid, results });
});
