// Tidy — dashboard support request capture (server-side write).
//
// Requires a signed-in caller: the row is always attributed to the JWT's
// user id, never to a client-supplied user_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const BodySchema = z.object({
  type: z.enum(["reschedule", "note", "access", "other"]),
  payload: z.record(z.unknown()).default({}),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid JSON body" }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: "validation_failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  const { error } = await admin.from("support_requests").insert({
    user_id: userData.user.id,
    type: parsed.data.type,
    payload: parsed.data.payload,
  });
  if (error) {
    console.error("[submit-support-request] insert failed", error.message);
    await admin.from("integration_logs").insert({
      source: "internal",
      event: "support_requests.insert_failed",
      status: "error",
      error_message: error.message,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
