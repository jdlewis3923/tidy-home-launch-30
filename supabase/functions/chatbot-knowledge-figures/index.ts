import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Returns ONLY the distinct dollar figures found in the live chatbot knowledge
 * row — the same row both readers pick with ORDER BY updated_at DESC LIMIT 1.
 *
 * This exists so `src/test/chatbot-knowledge-canon.test.ts` can hold the live
 * knowledge base to the pricing canon. It never returns the prose, so the
 * endpoint is safe to call without a session.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data, error } = await supabase
      .from("chatbot_knowledge")
      .select("id, updated_at, content")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return new Response(JSON.stringify({ error: "no knowledge row" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content: string = data.content ?? "";
    const figures = [...content.matchAll(/\$\s?([0-9][0-9,]*)/g)].map((m) => m[1]);
    const distinct = [...new Set(figures)];

    return new Response(
      JSON.stringify({
        id: data.id,
        updated_at: data.updated_at,
        length: content.length,
        figures: distinct,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[chatbot-knowledge-figures] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
