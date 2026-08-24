// Tidy — chatbot callback lead capture (server-side write).
//
// Mirrors submit-waitlist: no anon INSERT grant on public.chatbot_leads,
// so the row is written here with the service role after validation.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const BodySchema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().min(7).max(32),
  question: z.string().trim().max(4000).optional().nullable(),
  source_page: z.string().trim().max(200).optional().nullable(),
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

  const { error } = await admin.from("chatbot_leads").insert({
    name: parsed.data.name || null,
    phone: parsed.data.phone,
    question: parsed.data.question || null,
    source_page: parsed.data.source_page || null,
  });
  if (error) {
    console.error("[submit-chatbot-lead] insert failed", error.message);
    await admin.from("integration_logs").insert({
      source: "internal",
      event: "chatbot_leads.insert_failed",
      status: "error",
      error_message: error.message,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: "insert_failed" }, 500);
  }

  return jsonResponse({ ok: true });
});
