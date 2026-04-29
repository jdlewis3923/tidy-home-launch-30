// Stub: generates a combined PDF (signed ICA + onboarding packet + Schedule A)
// for a given contractor. Returns 200 with a placeholder until source docs flow in.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("[print-contractor-packet] request:", body);

    return new Response(
      JSON.stringify({
        ok: true,
        stub: true,
        message: "Packet generation stub. Will combine signed ICA + onboarding packet + Schedule A once HelloSign sync is live.",
        contractor_id: (body as Record<string, unknown>)?.contractor_id ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    console.error("[print-contractor-packet] error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
