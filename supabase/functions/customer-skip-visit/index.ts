import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Customer skips a single upcoming visit.
//
// Member Guide rules enforced here:
//   - 48+ hours' notice: skip allowed, the visit is credited on the next bill.
//   - 24–48 hours: no skip — the guide offers a free reschedule within the
//     same week instead.
//   - Under 24 hours: too late, contact us.
//   - At most 2 credited skips per calendar year per service.
// The credit is a member_credits row applied to the Stripe customer balance;
// if Stripe is unreachable the row stays pending and member-ops-tick retries.

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { withLogging } from "../_shared/withLogging.ts";
import { applyMemberCredit } from "../_shared/member-credits.ts";
import { stripeSecretKey } from "../_shared/stripe-mode.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = stripeSecretKey();

const InputSchema = z.object({
  visit_id: z.string().uuid(),
});

const HOUR_MS = 3_600_000;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const supabaseAuth = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  const userId = userData.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: parsed.error.flatten().fieldErrors }, 400);
  }
  const { visit_id } = parsed.data;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: "internal",
      event: "customer.visit.skip",
      payload: { user_id: userId, visit_id },
      fn: async () => {
        const { data: siteVisit, error: vErr } = await supabase
          .from("visits")
          .select("id, user_id, visit_date, scheduled_start, status, service, subscription_id, jobber_visit_id")
          .eq("id", visit_id)
          .maybeSingle();
        if (vErr) throw new Error(vErr.message);
        // Jobber is the schedule of record: Jobber-owned plans skip their mirrored Jobber visit.
        let visit: any = siteVisit;
        let jobber: any = null;
        if (siteVisit?.subscription_id) {
          const { data: owned } = await supabase.rpc("subscription_jobber_owned", { _sub: siteVisit.subscription_id });
          if (owned && !(siteVisit as any).jobber_visit_id) visit = null;
        }
        if (!siteVisit) {
          const { data: jv } = await supabase.from("jobber_visits")
            .select("id, user_id, subscription_id, service_line, start_at, status, deleted_at, customer_skipped_at, jobber_visit_id, raw, is_test")
            .eq("id", visit_id).maybeSingle();
          if (jv) {
            jobber = jv;
            visit = {
              id: jv.id, user_id: jv.user_id, subscription_id: jv.subscription_id, service: jv.service_line,
              scheduled_start: jv.start_at, visit_date: String(jv.start_at).slice(0, 10),
              status: jv.customer_skipped_at ? "skipped" : jv.status === "complete" ? "complete" : jv.deleted_at ? "canceled" : "scheduled",
            };
          }
        }

        if (!visit || visit.user_id !== userId) {
          return { ok: false as const, error: "We couldn't find that visit on your account." };
        }
        if (visit.status === "skipped") {
          return { ok: false as const, error: "That visit is already skipped." };
        }
        if (visit.status === "complete") {
          return { ok: false as const, error: "That visit is already complete." };
        }
        if (visit.status === "canceled") {
          return { ok: false as const, error: "That visit is already canceled." };
        }

        // Notice window, measured against the scheduled start when known.
        const startMs = visit.scheduled_start
          ? Date.parse(visit.scheduled_start)
          : Date.parse(`${visit.visit_date}T12:00:00-04:00`);
        const noticeMs = startMs - Date.now();
        if (noticeMs < 24 * HOUR_MS) {
          return {
            ok: false as const,
            error: "That visit is too close to change. Please reach out and we'll help.",
          };
        }
        if (noticeMs < 48 * HOUR_MS) {
          return {
            ok: false as const,
            error: "Inside 48 hours we can't skip, but we can move it free within the same week — tap reschedule instead.",
          };
        }

        // At most 2 credited skips per calendar year per service.
        const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
        const { count: skipsThisYear, error: countErr } = await supabase
          .from("member_credits")
          .select("id, visits!inner(service)", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("kind", "skip_credit")
          .neq("status", "void")
          .eq("visits.service", visit.service)
          .gte("created_at", yearStart);
        if (countErr) throw new Error(countErr.message);
        const { count: jobberSkips } = await supabase.from("jobber_visits").select("id", { count: "exact", head: true })
          .eq("user_id", userId).eq("service_line", visit.service).not("customer_skipped_at", "is", null).gte("customer_skipped_at", yearStart);
        const skipsUsed = (skipsThisYear ?? 0) + (jobberSkips ?? 0);
        if (skipsUsed >= 2) {
          return {
            ok: false as const,
            error: "You've used your 2 skips for this service this year. We can still reschedule the visit free — tap reschedule instead.",
          };
        }

        let priceCents: number | null = null;
        if (jobber) {
          // Jobber catalog prices mirror the rate card; the visit's line items carry them.
          const items = (jobber.raw?.lineItems?.nodes ?? []) as { totalPrice?: number; unitPrice?: number; quantity?: number }[];
          priceCents = Math.round(items.reduce((t, i) => t + Number(i.totalPrice ?? (i.unitPrice ?? 0) * (i.quantity ?? 1)), 0) * 100);
        } else {
          const { data, error: priceErr } = await supabase.rpc("visit_customer_price_cents", { _visit: visit.id });
          if (priceErr) throw new Error(priceErr.message);
          priceCents = data;
        }
        if (!priceCents || priceCents <= 0) {
          return { ok: false as const, error: "We couldn't price that visit. Please reach out and we'll help." };
        }

        if (jobber) {
          // Remove it in Jobber (and its Connecteam shift) first; only then record the skip.
          const r = await fetch(`${SUPABASE_URL}/functions/v1/jobber-sync`, {
            method: "POST",
            headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "skip_visit", mirror_id: jobber.id }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.ok) throw new Error(`jobber skip failed: ${j.error ?? r.status}`);
        } else {
          const { error: upErr } = await supabase
            .from("visits")
            .update({ status: "skipped", lifecycle_reason: "customer_skip" })
            .eq("id", visit.id)
            .eq("user_id", userId);
          if (upErr) throw new Error(upErr.message);
        }

        // The credit row is the promise; Stripe application follows.
        const { data: creditId, error: creditErr } = await supabase.rpc("issue_member_credit", {
          _user: userId,
          _subscription: visit.subscription_id,
          _visit: jobber ? null : visit.id,
          _kind: "skip_credit",
          _amount_cents: priceCents,
          _note: "Skipped visit credited on your next bill",
        });
        if (creditErr) throw new Error(creditErr.message);

        let creditStatus = "pending";
        if (creditId && STRIPE_SECRET_KEY) {
          const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: "2024-12-18.acacia",
            httpClient: Stripe.createFetchHttpClient(),
          });
          const applied = await applyMemberCredit(stripe, supabase, {
            id: creditId,
            user_id: userId,
            amount_cents: priceCents,
            kind: "skip_credit",
            note: "Skipped visit credited on your next bill",
          });
          creditStatus = applied.applied ? "applied" : "pending";
        }

        await supabase.from("member_notifications").insert({
          user_id: userId,
          kind: "skip_credit",
          title: "Visit skipped — credit on its way",
          body: `Your visit is skipped and $${(priceCents / 100).toFixed(2)} comes off your next bill. You have ${1 - skipsUsed} skip${1 - skipsUsed === 1 ? "" : "s"} left for this service this year.`,
          dedupe_key: `skip-credit-${visit.id}`,
          related_visit_id: jobber ? null : visit.id,
        });

        return { ok: true as const, visit_id: visit.id, status: "skipped", credit_cents: priceCents, credit_status: creditStatus };
      },
    });

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[customer-skip-visit] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
