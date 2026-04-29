// Stub: pulls Brevo /v3/templates list and upserts as company_documents
// rows with category='Email Templates'. Currently a no-op that returns 200.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("[sync-brevo-templates] invoked at", new Date().toISOString());
  // TODO: fetch https://api.brevo.com/v3/smtp/templates with BREVO_API_KEY,
  // upsert each into company_documents (brevo_template_id unique).

  return new Response(
    JSON.stringify({ ok: true, stub: true, synced: 0 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
});
