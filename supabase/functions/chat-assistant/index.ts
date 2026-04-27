// Tidy chatbot — Lovable AI Gateway, streaming, knowledge-base grounded.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Msg = { role: "user" | "assistant"; content: string };

const FALLBACK_KNOWLEDGE =
  "Tidy Home Concierge LLC — Miami subscription home service (cleaning, lawn, detailing). Phone: (786) 829-1141. ZIPs: 33183, 33186, 33156.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = (await req.json()) as { messages: Msg[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Fetch knowledge base (public read).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: kbRow } = await supabase
      .from("chatbot_knowledge")
      .select("content")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const knowledge = kbRow?.content?.trim() || FALLBACK_KNOWLEDGE;

    const systemPrompt = `You are Tidy's friendly concierge assistant. You help homeowners in Miami learn about Tidy Home Concierge's subscription cleaning, lawn care, and car detailing services.

RULES:
- Answer ONLY using the BUSINESS KNOWLEDGE below. Do not invent prices, ZIPs, hours, or policies.
- Be warm, brief (1–3 short sentences), and use plain English. No bullet vomit.
- If the user asks something not covered (specific quote, scheduling change, complaint, anything you're not sure of), say: "I'm not 100% sure on that — text or call us at (786) 829-1141, or share your name and phone and we'll reach out." Do not guess.
- Never claim to book, cancel, or reschedule visits yourself.
- If asked about pricing in general terms, you may quote ranges from the knowledge but always offer the phone number for an exact quote.
- Currency is USD. Service area is Miami (Kendall, Pinecrest area).

BUSINESS KNOWLEDGE:
${knowledge}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Too many requests. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please contact support." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const t = await aiResp.text();
      console.error("[chat-assistant] gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[chat-assistant] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
