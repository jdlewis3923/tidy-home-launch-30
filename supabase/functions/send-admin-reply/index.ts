// Admin sends a reply on behalf of Tidy. SMS goes via Twilio, web via realtime (DB insert).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIDY_FROM = "+17868291141";

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
    if (conv.channel === "sms") {
      if (!conv.customer_phone_e164) {
        return new Response(JSON.stringify({ error: "no phone on conversation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
      const TWILIO_AUTH_TOKEN_RAW = Deno.env.get("TWILIO_AUTH_TOKEN");
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN_RAW) {
        return new Response(JSON.stringify({ error: "twilio not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
      const basic = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN_RAW}`);
      const sendResp = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: conv.customer_phone_e164,
          From: TIDY_FROM,
          Body: body,
        }),
      });
      const sendData = await sendResp.json().catch(() => ({}));
      if (!sendResp.ok) {
        return new Response(
          JSON.stringify({ error: `twilio ${sendResp.status}`, details: sendData }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      twilioSid = sendData?.sid || null;
    }
    // For web: just inserting the row triggers realtime → widget renders it.

    const { data: inserted, error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        conversation_id,
        direction: "outbound",
        sender_type: "admin",
        sender_user_id: userId,
        body,
        twilio_sid: twilioSid,
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;

    return new Response(
      JSON.stringify({ ok: true, message_id: inserted.id, twilio_sid: twilioSid }),
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
