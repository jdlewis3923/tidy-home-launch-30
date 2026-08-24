// Tidy — durable consent record (Terms assent + SMS/TCPA consent).
//
// Stores the exact wording the customer agreed to, the version, the
// timestamp, the IP and the user agent. IP must be derived server-side from
// request headers — a client-supplied IP is worthless as evidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const BodySchema = z.object({
  kind: z.enum(["terms", "sms"]),
  version: z.string().trim().min(1).max(40),
  wording: z.string().trim().min(10).max(4000),
  granted: z.boolean().default(true),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
});

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? null;
}

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

  // Attribute to the signed-in user when a session is present. Signup consent
  // is captured before confirmation, so email-only rows are expected.
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await asUser.auth.getUser();
    userId = data.user?.id ?? null;
  }

  const { error } = await admin.from("user_consents").insert({
    user_id: userId,
    email: parsed.data.email ?? null,
    kind: parsed.data.kind,
    version: parsed.data.version,
    wording: parsed.data.wording,
    granted: parsed.data.granted,
    ip: clientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  if (error) {
    console.error("[record-consent] insert failed", error.message);
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
