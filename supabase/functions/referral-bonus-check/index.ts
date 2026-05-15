/**
 * referral-bonus-check
 *
 * Daily cron. For each pro_referrals row where the referee has completed
 * >= 10 visits and bonus has not been paid, transfers the configured referral
 * bonus (app_settings.referral_bonus_amount_cents) to the referrer's Stripe
 * Connect account and marks the row paid. Single source of truth — the same
 * value powers the /pro widget so display + payout never drift.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REFERRAL_THRESHOLD_VISITS = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const stripeKey = Deno.env.get("STRIPE_CONNECT_API_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY");

  // Single source of truth for the bonus amount.
  const { data: setting } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "referral_bonus_amount_cents")
    .maybeSingle();
  const bonusCents = Number(setting?.value ?? 20000);

  const { data: pending, error } = await supabase
    .from("pro_referrals")
    .select("id, referrer_contractor_id, referee_contractor_id, status")
    .is("bonus_paid_at", null)
    .neq("status", "void");

  if (error) {
    return new Response(JSON.stringify({ error: error.message, bonusCents }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let paid = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of pending ?? []) {
    if (!row.referee_contractor_id) {
      results.push({ id: row.id, skipped: "no_referee" });
      continue;
    }

    const { count } = await supabase
      .from("pro_visits")
      .select("id", { count: "exact", head: true })
      .eq("contractor_id", row.referee_contractor_id)
      .eq("status", "complete");

    if ((count ?? 0) < REFERRAL_THRESHOLD_VISITS) {
      results.push({ id: row.id, skipped: "below_threshold", visits: count });
      continue;
    }

    // Look up referrer's Stripe Connect account from stripe_payouts metadata
    // (best-effort — not every Pro has a stored account yet).
    const { data: payoutRow } = await supabase
      .from("stripe_payouts")
      .select("stripe_account_id")
      .eq("contractor_id", row.referrer_contractor_id)
      .limit(1)
      .maybeSingle();
    const acct = (payoutRow as any)?.stripe_account_id ?? null;

    let transferId: string | null = null;
    if (stripeKey && acct) {
      try {
        const body = new URLSearchParams({
          amount: String(bonusCents),
          currency: "usd",
          destination: acct,
          description: `Tidy referral bonus (${REFERRAL_THRESHOLD_VISITS} visits)`,
        });
        const r = await fetch("https://api.stripe.com/v1/transfers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        const j = await r.json();
        transferId = j?.id ?? null;
        if (!r.ok) {
          results.push({ id: row.id, error: j?.error?.message ?? "stripe_error" });
          continue;
        }
      } catch (e) {
        results.push({ id: row.id, error: String(e) });
        continue;
      }
    }

    await supabase.from("pro_referrals").update({
      status: "paid",
      bonus_paid_at: new Date().toISOString(),
      bonus_cents: bonusCents,
    }).eq("id", row.id);

    paid += 1;
    results.push({ id: row.id, paid: true, bonusCents, transferId, acct });
  }

  return new Response(JSON.stringify({ ok: true, bonusCents, paid, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
