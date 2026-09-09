// Twilio inbound SMS webhook.
// Validates X-Twilio-Signature, runs assistant, sends reply via Twilio, logs everything.
//
// RESPONSE-PATH RULE (reliability audit item 3)
// -----------------------------------------------------------------------------
// Twilio abandons an inbound webhook at ~15s and RETRIES it, which used to mean
// a slow model turned one inbound text into a duplicate reply. The model call is
// never given a deadline (aborting it still bills and it legitimately takes
// tens of seconds), so instead it is moved OFF the response path: we persist the
// inbound message, answer Twilio with empty TwiML immediately, and finish the
// assistant + reply + admin email in the background via EdgeRuntime.waitUntil.
// Every outbound HTTP hop inside that background work is bounded by vendorFetch.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";
import { runSupportAssistant, notifyAdminEmail, type SupportMsg } from "../_shared/support-assistant.ts";
import { vendorFetch } from '../_shared/http.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-twilio-signature, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Sending number comes from TWILIO_FROM_NUMBER only — never hardcoded.
const TIDY_FROM = Deno.env.get("TWILIO_FROM_NUMBER");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TWIML_OK = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;

function twiml(status = 200) {
  return new Response(TWIML_OK, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/xml" },
  });
}

/** Run work after the response is sent, where the platform supports it. */
function runInBackground(work: Promise<unknown>) {
  const guarded = work.catch((e) => console.error("[twilio-inbound-sms] background", e));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(guarded);
  return guarded;
}

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

// deno-lint-ignore no-explicit-any
async function handleConversation(supabase: any, args: {
  convId: string;
  from: string;
  body: string;
  messageSid: string | null;
}) {
  const { convId, from, body, messageSid } = args;

  // Build history (last 20 messages)
  const { data: hist } = await supabase
    .from("support_messages")
    .select("sender_type, body")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: true })
    .limit(20);

  const history: SupportMsg[] = (hist || []).map((m: { sender_type: string; body: string }) => ({
    role: m.sender_type === "customer" ? "user" : "assistant",
    content: m.body,
  }));

  // Run assistant (unbounded on purpose — off the response path)
  const result = await runSupportAssistant(history, "sms");

  // Decide reply
  const shouldAutoSend = !result.escalate && result.confidence >= 0.7;
  const replyToSend = shouldAutoSend
    ? result.reply
    : "Got your message — a real human gets back to you within 1 hour. — Tidy";

  // Send through send-twilio-sms so the FTSA send window, idempotency,
  // delivery callback and logging apply. The AI must never reply at 11pm on
  // a Sunday; outside the window the reply is parked in sms_outbox.
  let twilioOutboundSid: string | null = null;
  let twilioError: string | null = null;
  let twilioQueued = false;
  try {
    const sendResp = await vendorFetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to_phone_e164: from,
        body: replyToSend,
        idempotency_key: `support-reply-${messageSid}`,
        template_name: shouldAutoSend ? "support-ai-reply" : "support-human-ack",
        triggered_by: "twilio-inbound-sms",
      }),
    });
    const sendData = await sendResp.json().catch(() => ({}));
    if (sendResp.status === 202 && sendData?.queued === true) {
      twilioQueued = true;
    } else if (!sendResp.ok || sendData?.sent !== true) {
      twilioError = `send-twilio-sms ${sendResp.status}: ${String(sendData?.error ?? "").slice(0, 200)}`;
      console.error("[twilio-inbound-sms]", twilioError);
    } else {
      twilioOutboundSid = sendData?.message_sid ?? null;
    }
  } catch (e) {
    twilioError = e instanceof Error ? e.message : "twilio send failed";
    console.error("[twilio-inbound-sms]", twilioError);
  }

  // Log outbound (auto_reply or escalation ack). A parked or failed reply is
  // recorded as such — never as a delivered message.
  await supabase.from("support_messages").insert({
    conversation_id: convId,
    direction: shouldAutoSend ? "auto_reply" : "outbound",
    sender_type: "ai",
    body: twilioQueued ? `[queued for next send window] ${replyToSend}` : replyToSend,
    ai_confidence: result.confidence,
    twilio_sid: twilioOutboundSid,
  });

  if (twilioError) {
    await supabase.from("admin_alerts").insert({
      alert_type: "support_reply_send_failed",
      title: "A support reply was not delivered",
      body: `${from}: ${twilioError}`,
      context: { conversation_id: convId, message_sid: messageSid },
    }).then(() => {}, () => {});
  }

  // Update conversation status / counters
  const updates: Record<string, unknown> = {};
  if (shouldAutoSend) {
    const { data: conv } = await supabase
      .from("support_conversations")
      .select("ai_handled_count")
      .eq("id", convId)
      .single();
    updates.ai_handled_count = (conv?.ai_handled_count ?? 0) + 1;
  } else {
    updates.status = "escalated";
  }
  await supabase.from("support_conversations").update(updates).eq("id", convId);

  // Email admin
  await notifyAdminEmail({
    channel: "sms",
    customerLabel: from,
    inboundBody: body,
    aiDraft: result.reply,
    conversationId: convId,
    escalated: !shouldAutoSend,
    confidence: result.confidence,
  });
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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

    // Insert inbound message. Idempotent on the Twilio SID so a retry (or a
    // duplicate delivery) cannot produce a second reply.
    if (messageSid) {
      const { data: dupe } = await supabase
        .from("support_messages")
        .select("id")
        .eq("twilio_sid", messageSid)
        .eq("direction", "inbound")
        .maybeSingle();
      if (dupe?.id) {
        console.log("[twilio-inbound-sms] duplicate inbound", messageSid);
        return twiml();
      }
    }

    await supabase.from("support_messages").insert({
      conversation_id: convId!,
      direction: "inbound",
      sender_type: "customer",
      body,
      twilio_sid: messageSid,
    });

    // Answer Twilio now; finish the assistant work in the background.
    runInBackground(handleConversation(supabase, { convId: convId!, from, body, messageSid }));

    return twiml();
  } catch (e) {
    console.error("[twilio-inbound-sms] fatal", e);
    return twiml();
  }
});
