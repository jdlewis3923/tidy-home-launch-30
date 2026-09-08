// Admin sends a reply on behalf of Tidy. SMS goes via Twilio, web via realtime (DB insert).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Sending number comes from TWILIO_FROM_NUMBER only — never hardcoded.
const TIDY_FROM = Deno.env.get("TWILIO_FROM_NUMBER");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { conversation_id, body } = await req.json();
    if (!conversation_id || !body || typeof body !== "string") {
      return new Response(JSON.stringify({ error: "conversation_id and body required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conv, error: convErr } = await supabase
      .from("support_conversations")
      .select("id, channel, customer_phone_e164")
      .eq("id", conversation_id)
      .single();
    if (convErr || !conv) {
      return new Response(JSON.stringify({ error: "conversation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let twilioSid: string | null = null;
    let queued = false;
    if (conv.channel === "sms") {
      if (!conv.customer_phone_e164) {
        return new Response(JSON.stringify({ error: "no phone on conversation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Phase 4: route through send-twilio-sms so the FTSA send window,
      // idempotency and delivery receipts apply to admin replies too.
      const sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-twilio-sms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to_phone_e164: conv.customer_phone_e164,
          body,
          idempotency_key: `admin-reply-${conversation_id}-${Date.now()}`,
          template_name: "support-admin-reply",
          triggered_by: "send-admin-reply",
        }),
      });
      const sendData = await sendResp.json().catch(() => ({}));
      if (sendResp.status === 202 && sendData?.queued === true) {
        queued = true;
      } else if (!sendResp.ok || sendData?.sent !== true) {
        return new Response(
          JSON.stringify({ error: `sms_send_failed (${sendResp.status})`, details: sendData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } else {
        twilioSid = sendData?.message_sid ?? null;
      }
    }
    // For web: just inserting the row triggers realtime → widget renders it.

    const { data: inserted, error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        conversation_id,
        direction: "outbound",
        sender_type: "admin",
        sender_user_id: userId,
        body: queued ? `[queued for next send window] ${body}` : body,
        twilio_sid: twilioSid,
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;

    return new Response(
      JSON.stringify({ ok: true, message_id: inserted.id, twilio_sid: twilioSid, queued }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("[send-admin-reply] error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
