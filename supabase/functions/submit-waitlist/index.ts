// Tidy — waitlist capture (server-side write).
//
// The client cannot INSERT into public.waitlist (no anon grant, by design:
// the table holds PII and an open INSERT policy invites spam). This function
// validates the payload and writes with the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  address: z.string().trim().min(3).max(300).optional(),
  zip: z.string().regex(/^\d{5}$/),
  source: z.string().trim().min(1).max(64),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

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

  const { error } = await admin.from("waitlist").insert(parsed.data);
  if (error) {
    console.error("[submit-waitlist] insert failed", error.message);
    await admin.from("integration_logs").insert({
      source: "internal",
      event: "waitlist.insert_failed",
      status: "error",
      error_message: error.message,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
