// Stub: HelloSign webhook receiver. Logs the payload and returns 200.
// Full implementation will: verify signature, fetch signed PDF, upload to
// company-docs bucket, insert company_documents row with category='Signed Contracts'
// tagged with contractor name + service + signing date.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ct = req.headers.get("content-type") || "";
    let payload: unknown = null;
    if (ct.includes("application/json")) {
      payload = await req.json().catch(() => null);
    } else if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const obj: Record<string, unknown> = {};
      for (const [k, v] of fd.entries()) obj[k] = typeof v === "string" ? v : `[file:${(v as File).name}]`;
      payload = obj;
    } else {
      payload = await req.text().catch(() => null);
    }

    console.log("[sync-hellosign-doc] received payload:", JSON.stringify(payload).slice(0, 4000));

    // Best-effort log to integration_logs if service role is available.
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const sb = createClient(url, key);
      await sb.from("integration_logs").insert({
        source: "hellosign",
        event: "webhook_received",
        status: "stub_ok",
      }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({ ok: true, stub: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[sync-hellosign-doc] error:", err);
    return new Response(JSON.stringify({ ok: true, stub: true, note: "error swallowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
