// Web chat ingest endpoint. Public — no JWT required.
// Same assistant + admin email path as SMS, but reply returned inline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runSupportAssistant, notifyAdminEmail, type SupportMsg } from "../_shared/support-assistant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const visitorId = (payload?.visitor_id || "").toString().trim();
    const message = (payload?.message || "").toString().trim();
    const email = payload?.email ? String(payload.email).trim() : null;
    const name = payload?.name ? String(payload.name).trim() : null;

    if (!visitorId || !message) {
      return new Response(
        JSON.stringify({ error: "visitor_id and message required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find or create web conversation
    let convId: string | null = null;
    {
      const { data } = await supabase
        .from("support_conversations")
        .select("id")
        .eq("channel", "web")
        .eq("visitor_id", visitorId)
        .maybeSingle();

      if (data?.id) {
        convId = data.id;
        // Update contact info if newly known
        if (email || name) {
          await supabase
            .from("support_conversations")
            .update({
              customer_email: email || undefined,
              customer_name: name || undefined,
            })
            .eq("id", convId);
        }
      } else {
        const { data: created, error } = await supabase
          .from("support_conversations")
          .insert({
            channel: "web",
            visitor_id: visitorId,
            customer_email: email,
            customer_name: name,
            status: "open",
          })
          .select("id")
          .single();
        if (error) throw error;
        convId = created.id;
      }
    }

    // Insert inbound
    await supabase.from("support_messages").insert({
      conversation_id: convId!,
      direction: "inbound",
      sender_type: "customer",
      body: message,
    });

    // Build history
    const { data: hist } = await supabase
      .from("support_messages")
      .select("sender_type, body")
      .eq("conversation_id", convId!)
      .order("created_at", { ascending: true })
      .limit(20);

    const history: SupportMsg[] = (hist || []).map((m) => ({
      role: m.sender_type === "customer" ? "user" : "assistant",
      content: m.body,
    }));

    const result = await runSupportAssistant(history, "web");
    const shouldAutoSend = !result.escalate && result.confidence >= 0.7;
    const replyToSend = shouldAutoSend
      ? result.reply
      : "Thanks — a real teammate will reach out shortly. You can also call us at (786) 829-1141.";

    await supabase.from("support_messages").insert({
      conversation_id: convId!,
      direction: shouldAutoSend ? "auto_reply" : "outbound",
      sender_type: "ai",
      body: replyToSend,
      ai_confidence: result.confidence,
    });

    const updates: Record<string, unknown> = {};
    if (shouldAutoSend) {
      const { data: conv } = await supabase
        .from("support_conversations")
        .select("ai_handled_count")
        .eq("id", convId!)
        .single();
      updates.ai_handled_count = (conv?.ai_handled_count ?? 0) + 1;
    } else {
      updates.status = "escalated";
    }
    await supabase.from("support_conversations").update(updates).eq("id", convId!);

    // Email admin only on escalation OR if no human ever replied yet (kept simple: email every escalation)
    if (!shouldAutoSend) {
      await notifyAdminEmail({
        channel: "web",
        customerLabel: name ? `${name} (${email || visitorId})` : (email || visitorId),
        inboundBody: message,
        aiDraft: result.reply,
        conversationId: convId!,
        escalated: true,
        confidence: result.confidence,
      });
    }

    return new Response(
      JSON.stringify({
        reply: replyToSend,
        conversation_id: convId,
        escalated: !shouldAutoSend,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[chat-message] fatal", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
