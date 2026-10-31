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
    // Sentences touching drift-prone topics, so canon-docs.test.ts can check wording.
    // The chatbot already says these to anyone, so returning them is not sensitive.
    const watch = /(polo|\btees?\b|camiseta|hedge|eco-|disinfect|desinfect|\bbag|credit|deep clean|bundle|one-time|uniform)/i;
    const sentences = content.split(/(?<=[.!?])\s+|\n+/).filter((x) => watch.test(x)).slice(0, 200);

    // Onboarding modules are Pro-only, so only drift hits (slug + term) are returned, never prose.
    const { data: mods } = await supabase.from("onboarding_module").select("slug, body_md, title");
    const drift: [string, RegExp][] = [["polo", /\bpolos?\b/i], ["tee", /\btees?\b|t-shirt|camiseta/i], ["hedge trim", /hedge trim|poda de arbustos/i],
      ["eco-safe", /eco-?safe|eco-friendly|ecológic/i], ["disinfect", /disinfect|desinfect/i], ["bagged clippings", /(bag(ged|ging)?|embols)[^.]{0,40}(clipping|grama)|clippings?[^.]{0,40}\bbag/i],
      ["bundle discount", /bundle discount/i], ["redo credit", /credit instead of|crédito en lugar/i]];
    const negated = (x: string) => /\b(never|no|not|nunca|sin|ni)\b/i.test(x);
    const onboarding_hits = (mods ?? []).flatMap((m) => `${m.title}. ${m.body_md}`.split(/(?<=[.!?])\s+|\n+/)
      .flatMap((x) => drift.filter(([, re]) => re.test(x) && !negated(x)).map(([term]) => ({ slug: m.slug, term }))));

    return new Response(
      JSON.stringify({
        onboarding_hits,
        onboarding_count: mods?.length ?? 0,
        id: data.id,
        updated_at: data.updated_at,
        length: content.length,
        figures: distinct,
        sentences,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[chatbot-knowledge-figures] error", e);
    // Onboarding modules are Pro-only, so only drift hits (slug + term) are returned, never prose.
    const { data: mods } = await supabase.from("onboarding_module").select("slug, body_md, title");
    const drift: [string, RegExp][] = [["polo", /\bpolos?\b/i], ["tee", /\btees?\b|t-shirt|camiseta/i], ["hedge trim", /hedge trim|poda de arbustos/i],
      ["eco-safe", /eco-?safe|eco-friendly|ecológic/i], ["disinfect", /disinfect|desinfect/i], ["bagged clippings", /(bag(ged|ging)?|embols)[^.]{0,40}(clipping|grama)|clippings?[^.]{0,40}\bbag/i],
      ["bundle discount", /bundle discount/i], ["redo credit", /credit instead of|crédito en lugar/i]];
    const negated = (x: string) => /\b(never|no|not|nunca|sin|ni)\b/i.test(x);
    const onboarding_hits = (mods ?? []).flatMap((m) => `${m.title}. ${m.body_md}`.split(/(?<=[.!?])\s+|\n+/)
      .flatMap((x) => drift.filter(([, re]) => re.test(x) && !negated(x)).map(([term]) => ({ slug: m.slug, term }))));

    return new Response(
      JSON.stringify({
        onboarding_hits,
        onboarding_count: mods?.length ?? 0, error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
