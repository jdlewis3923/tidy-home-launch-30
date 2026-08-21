// Tidy — Customer skips a single upcoming visit.
//
// Auth-gated. Ownership of the visit is verified against the JWT user_id.
// Local-only: no Stripe call, no credit issued.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { withLogging } from "../_shared/withLogging.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const InputSchema = z.object({
  visit_id: z.string().uuid(),
});

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
        const { data: visit, error: vErr } = await supabase
          .from("visits")
          .select("id, user_id, visit_date, status")
          .eq("id", visit_id)
          .maybeSingle();
        if (vErr) throw new Error(vErr.message);

        if (!visit || visit.user_id !== userId) {
          return { ok: false as const, error: "We couldn't find that visit on your account." };
        }

        const todayISO = new Date().toISOString().slice(0, 10);
        if (visit.visit_date <= todayISO) {
          return {
            ok: false as const,
            error: "That visit is too close to skip. Please reach out and we'll help.",
          };
        }
        if (visit.status === "skipped") {
          return { ok: false as const, error: "That visit is already skipped." };
        }
        if (visit.status === "complete") {
          return { ok: false as const, error: "That visit is already complete." };
        }

        const { error: upErr } = await supabase
          .from("visits")
          .update({ status: "skipped" })
          .eq("id", visit.id)
          .eq("user_id", userId);
        if (upErr) throw new Error(upErr.message);

        return { ok: true as const, visit_id: visit.id, status: "skipped" };
      },
    });

    return jsonResponse(result, result.ok ? 200 : 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error("[customer-skip-visit] failed", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
