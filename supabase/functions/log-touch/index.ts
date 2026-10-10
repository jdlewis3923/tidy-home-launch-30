// Tidy — anonymous attribution logging (QR scans + landing touches).
// Direct public inserts are blocked by RLS; this validates, rate-limits and writes with the service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { enforceRateLimit } from "../_shared/rate-limit.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const s = (n: number) => z.string().trim().max(n).nullish();

const Qr = z.object({
  kind: z.literal("qr_scan"),
  raw_code: z.string().trim().min(1).max(120),
  parsed: z.boolean(),
  lang: s(5), zip: s(10), placement: s(16), route: s(24), user_agent: s(500), referrer: s(500),
});
const Touch = z.object({
  kind: z.literal("landing_touch"),
  landing_source: z.string().trim().min(1).max(64),
  placement: s(16), zip: s(10), lang: s(5), route: s(24), path: s(200),
  utm_source: s(200), utm_medium: s(200), utm_campaign: s(200), utm_content: s(200),
  user_agent: s(500), referrer: s(500),
});
const Body = z.discriminatedUnion("kind", [Qr, Touch]);

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  const limited = await enforceRateLimit(req, { bucket: "log-touch", limit: 60, windowSeconds: 300 });
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: "validation_failed" }, 400);
  const { kind, ...row } = parsed.data;
  const { error } = await admin.from(kind === "qr_scan" ? "qr_scans" : "landing_touches").insert(row);
  if (error) {
    console.error("[log-touch] insert failed", error.message);
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }
  return jsonResponse({ ok: true });
});
