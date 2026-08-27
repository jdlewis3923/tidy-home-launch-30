// Tidy — Customer subscription self-service (cancel / undo cancel / pause / resume)
//
// Auth-gated. The caller's subscription is always resolved from the verified
// JWT's user_id — a subscription id is never accepted from the client.
// Writes go through the service-role client; Stripe is the source of truth.

import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { withLogging } from "../_shared/withLogging.ts";
import { resolveStripeCurrentPeriodEnd } from "../_shared/resolve-stripe-current-period-end.ts";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MAX_PAUSE_DAYS = 60;

const InputSchema = z.object({
  action: z.enum(["cancel", "undo_cancel", "pause", "resume"]),
  resume_on: z.string().min(4).max(40).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!STRIPE_SECRET_KEY) {
    return jsonResponse({ ok: false, error: "Stripe not configured" }, 500);
  }

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
  const { action, resume_on } = parsed.data;

  // Validate pause window before touching Stripe.
  let resumesAtUnix: number | null = null;
  if (action === "pause") {
    if (!resume_on) {
      return jsonResponse({ ok: false, error: "resume_on is required to pause" }, 400);
    }
    const resumeDate = new Date(resume_on.length === 10 ? `${resume_on}T12:00:00Z` : resume_on);
    if (Number.isNaN(resumeDate.getTime())) {
      return jsonResponse({ ok: false, error: "resume_on is not a valid date" }, 400);
    }
    const now = Date.now();
    if (resumeDate.getTime() <= now) {
      return jsonResponse({ ok: false, error: "resume_on must be a future date" }, 400);
    }
    if (resumeDate.getTime() - now > MAX_PAUSE_DAYS * 86_400_000) {
      return jsonResponse(
        { ok: false, error: `A pause can be at most ${MAX_PAUSE_DAYS} days. Pick an earlier restart date.` },
        400,
      );
    }
    resumesAtUnix = Math.floor(resumeDate.getTime() / 1000);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await withLogging({
      source: "stripe",
      event: `customer.subscription.${action}`,
      payload: { user_id: userId, action },
      fn: async () => {
        const { data: sub, error: subErr } = await supabase
          .from("subscriptions")
          .select("id, stripe_subscription_id, status, cancel_at_period_end, pause_collection")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (subErr) throw new Error(subErr.message);

        if (!sub) {
          return {
            ok: false as const,
            error: "We couldn't find a plan on your account yet.",
          };
        }
        if (!sub.stripe_subscription_id) {
          return {
            ok: false as const,
            error: "Your plan isn't linked to billing yet. Please contact us and we'll sort it out.",
          };
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, {
          apiVersion: "2024-12-18.acacia",
          httpClient: Stripe.createFetchHttpClient(),
        });

        // deno-lint-ignore no-explicit-any
        let stripeParams: any;
        let localPatch: Record<string, unknown>;

        switch (action) {
          case "cancel":
            stripeParams = { cancel_at_period_end: true };
            localPatch = { cancel_at_period_end: true, canceled_at: new Date().toISOString() };
            break;
          case "undo_cancel":
            stripeParams = { cancel_at_period_end: false };
            localPatch = { cancel_at_period_end: false, canceled_at: null, paused_until: null };
            break;
          case "pause":
            stripeParams = { pause_collection: { behavior: "void", resumes_at: resumesAtUnix } };
            localPatch = { pause_collection: "void", status: "paused" };
            break;
          case "resume":
            stripeParams = { pause_collection: "" };
            localPatch = { pause_collection: null, status: "active", paused_until: null };
            break;
        }

        const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, stripeParams);

        // Stripe holds the truth for the pause window — mirror resumes_at server-side.
        if (action === "pause") {
          const resumesAt = updated.pause_collection?.resumes_at ?? resumesAtUnix;
          localPatch.paused_until = resumesAt
            ? new Date(resumesAt * 1000).toISOString()
            : null;
        }


        const { error: upErr } = await supabase
          .from("subscriptions")
          .update(localPatch)
          .eq("id", sub.id);
        if (upErr) throw new Error(upErr.message);

        return {
          ok: true as const,
          action,
          subscription: {
            id: sub.id,
            status: (localPatch.status as string | undefined) ?? sub.status,
            cancel_at_period_end: updated.cancel_at_period_end,
            pause_collection: localPatch.pause_collection ?? null,
            current_period_end: updated.current_period_end ?? null,
          },
        };
      },
    });

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[customer-subscription-manage] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
