// Tidy — Twilio Delivery Status Callback
//
// Twilio POSTs form-encoded delivery receipts here for every outbound SMS on
// Messaging Service MG9a9f2067bd67c934b24464c42c55cedd. We validate the
// X-Twilio-Signature HMAC-SHA1 header against TWILIO_AUTH_TOKEN BEFORE trusting
// or persisting anything, then write the receipt to public.sms_delivery_events.
//
// Returns 204 on success (Twilio ignores the body), 403 on a bad signature.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Twilio signature = base64(HMAC-SHA1(authToken, url + sorted k+v pairs)). */
async function expectedSignature(url: string, params: Record<string, string>, token: string) {
  let data = url;
  for (const key of Object.keys(params).sort()) data += key + params[key];
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(mac)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  if (!TWILIO_AUTH_TOKEN) {
    console.error("[twilio-status-callback] TWILIO_AUTH_TOKEN not configured");
    return new Response("not configured", { status: 500 });
  }

  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return new Response("missing signature", { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("invalid form body", { status: 400 });
  }

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  // Twilio signs the exact URL it was configured with. Behind the Supabase
  // gateway the forwarded proto/host are authoritative.
  const incoming = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? incoming.host;
  const candidates = [
    `${proto}://${host}${incoming.pathname}${incoming.search}`,
    req.url,
  ];

  let valid = false;
  for (const url of candidates) {
    const expected = await expectedSignature(url, params, TWILIO_AUTH_TOKEN);
    if (timingSafeEqual(expected, signature)) {
      valid = true;
      break;
    }
  }
  if (!valid) {
    console.warn("[twilio-status-callback] signature validation failed");
    return new Response("invalid signature", { status: 403 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const errorCodeRaw = params.ErrorCode ?? "";
  const { error } = await supabase.from("sms_delivery_events").insert({
    message_sid: params.MessageSid ?? params.SmsSid ?? null,
    message_status: params.MessageStatus ?? params.SmsStatus ?? null,
    to_number: params.To ?? null,
    from_number: params.From ?? null,
    error_code: errorCodeRaw ? Number(errorCodeRaw) : null,
    error_message: params.ErrorMessage ?? null,
    messaging_service_sid: params.MessagingServiceSid ?? null,
    raw: params,
    received_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[twilio-status-callback] insert failed", error.message);
    return new Response("insert failed", { status: 500 });
  }

  return new Response(null, { status: 204 });
});
