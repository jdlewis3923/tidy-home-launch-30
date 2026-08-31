// Tidy — early-access lead capture (server-side write, source of truth).
//
// The website popup used to POST to Zapier with mode:"no-cors", which made the
// response opaque — a lead could vanish silently. This function is the durable
// write: it validates the payload and inserts into public.leads with the
// service role, then returns a real ok/false the client can branch on.
// The Zapier notification stays client-side and is allowed to fail.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BodySchema = z.object({
  first_name: z.string().trim().min(1).max(80),
  last_name: z.string().trim().max(80).optional().default(""),
  email: z.string().trim().toLowerCase().email().max(200),
  phone: z.string().trim().min(7).max(32),
  zip: z.string().trim().regex(/^\d{5}$/),
  sms_consent: z.boolean().optional().default(false),
  source: z.string().trim().min(1).max(64).optional().default("website_popup"),
  page_url: z.string().trim().max(500).optional().default(""),
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

  const body = parsed.data;
  const { data, error } = await admin
    .from("leads")
    .insert({
      first_name: body.first_name,
      last_name: body.last_name || null,
      email: body.email,
      phone: body.phone,
      zip: body.zip,
      sms_consent: body.sms_consent,
      source: body.source,
      page_url: body.page_url || null,
      user_agent: req.headers.get("user-agent")?.slice(0, 400) ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[submit-lead] insert failed", error.message);
    await admin.from("integration_logs").insert({
      source: "internal",
      event: "lead.insert_failed",
      status: "error",
      error_message: error.message,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  return jsonResponse({ ok: true, lead_id: data.id });
});
