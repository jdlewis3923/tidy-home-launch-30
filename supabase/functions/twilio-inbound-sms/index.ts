// Twilio inbound SMS webhook.
// Validates X-Twilio-Signature, runs assistant, sends reply via Twilio, logs everything.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";
import { runSupportAssistant, notifyAdminEmail, type SupportMsg } from "../_shared/support-assistant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-twilio-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TIDY_FROM = "+17868291141";

function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  const data = url + sortedKeys.map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const formText = await req.text();
    const formData = new URLSearchParams(formText);
    const params: Record<string, string> = {};
    for (const [k, v] of formData.entries()) params[k] = v;

    const signature = req.headers.get("x-twilio-signature") || "";
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
    const SKIP_SIG = Deno.env.get("TWILIO_SKIP_SIGNATURE") === "1";

    // Reconstruct the full URL Twilio used. Allow override via env for proxies.
    const fnUrl = Deno.env.get("TWILIO_INBOUND_URL")
      || `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-inbound-sms`;

    if (!SKIP_SIG && authToken) {
      const ok = validateTwilioSignature(authToken, signature, fnUrl, params);
      if (!ok) {
        console.warn("[twilio-inbound-sms] invalid signature");
        return new Response("invalid signature", { status: 403, headers: corsHeaders });
      }
    } else if (!authToken) {
      console.warn("[twilio-inbound-sms] TWILIO_AUTH_TOKEN missing — skipping signature check");
    }

    const from = params["From"] || "";
    const body = params["Body"] || "";
    const messageSid = params["MessageSid"] || null;

    if (!from || !body) {
      return new Response("missing From/Body", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find or create conversation by phone
    let convId: string | null = null;
    {
      const { data } = await supabase
        .from("support_conversations")
        .select("id")
        .eq("channel", "sms")
        .eq("customer_phone_e164", from)
        .maybeSingle();
      if (data?.id) {
        convId = data.id;
      } else {
        const { data: created, error } = await supabase
          .from("support_conversations")
          .insert({ channel: "sms", customer_phone_e164: from, status: "open" })
          .select("id")
          .single();
        if (error) throw error;
        convId = created.id;
      }
    }

    // Insert inbound message
    await supabase.from("support_messages").insert({
      conversation_id: convId!,
      direction: "inbound",
      sender_type: "customer",
      body,
      twilio_sid: messageSid,
    });

    // Build history (last 20 messages)
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

    // Run assistant
    const result = await runSupportAssistant(history, "sms");

    // Decide reply
    const shouldAutoSend = !result.escalate && result.confidence >= 0.7;
    const replyToSend = shouldAutoSend
      ? result.reply
      : "Got your message — a real human gets back to you within 1 hour. — Tidy";

    // Send via Twilio
    let twilioOutboundSid: string | null = null;
    let twilioError: string | null = null;
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN_RAW = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN_RAW) {
      try {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const basic = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN_RAW}`);
        const sendResp = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: from, From: TIDY_FROM, Body: replyToSend }),
        });
        const sendData = await sendResp.json().catch(() => ({}));
        if (!sendResp.ok) {
          twilioError = `twilio ${sendResp.status}: ${JSON.stringify(sendData).slice(0, 200)}`;
          console.error("[twilio-inbound-sms]", twilioError);
        } else {
          twilioOutboundSid = sendData?.sid || null;
        }
      } catch (e) {
        twilioError = e instanceof Error ? e.message : "twilio send failed";
        console.error("[twilio-inbound-sms]", twilioError);
      }
    } else {
      twilioError = "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing";
      console.warn("[twilio-inbound-sms]", twilioError);
    }

    // Log outbound (auto_reply or escalation ack)
    await supabase.from("support_messages").insert({
      conversation_id: convId!,
      direction: shouldAutoSend ? "auto_reply" : "outbound",
      sender_type: shouldAutoSend ? "ai" : "ai",
      body: replyToSend,
      ai_confidence: result.confidence,
      twilio_sid: twilioOutboundSid,
    });

    // Update conversation status / counters
    const updates: Record<string, unknown> = {};
    if (shouldAutoSend) {
      // increment ai_handled_count
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

    // Email admin
    const emailResult = await notifyAdminEmail({
      channel: "sms",
      customerLabel: from,
      inboundBody: body,
      aiDraft: result.reply,
      conversationId: convId!,
      escalated: !shouldAutoSend,
      confidence: result.confidence,
    });

    // Return TwiML empty (Twilio expects 200)
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
    return new Response(xml, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  } catch (e) {
    console.error("[twilio-inbound-sms] fatal", e);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml" },
    });
  }
});
