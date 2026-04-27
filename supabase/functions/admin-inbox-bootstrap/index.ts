// One-shot admin-only utility: configures the Twilio number's SMS webhook AND
// runs a synthetic signed-payload test against twilio-inbound-sms.
// Safe to leave deployed; gated by has_role('admin').
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TIDY_PHONE = "+17868291141";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";
const INBOUND_URL = "https://vcdhpsfuilrrrqfhfsjt.supabase.co/functions/v1/twilio-inbound-sms";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Admin gate
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }
  const supaAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await supaAuth.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (!claims?.claims?.sub) return json({ error: "unauthorized" }, 401);
  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: role } = await supa
    .from("user_roles")
    .select("role")
    .eq("user_id", claims.claims.sub as string)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return json({ error: "forbidden" }, 403);

  const action = new URL(req.url).searchParams.get("action") || "all";
  const out: Record<string, unknown> = {};

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TWILIO_API_KEY = Deno.env.get("TWILIO_API_KEY");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");

  // 1. Configure number
  if (action === "all" || action === "configure") {
    if (!LOVABLE_API_KEY || !TWILIO_API_KEY) {
      out.configure = { ok: false, error: "TWILIO_API_KEY/LOVABLE_API_KEY missing" };
    } else {
      try {
        const lookup = await fetch(
          `${GATEWAY_URL}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(TIDY_PHONE)}`,
          {
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TWILIO_API_KEY,
            },
          },
        );
        const lookupData = await lookup.json();
        const sid = lookupData?.incoming_phone_numbers?.[0]?.sid;
        if (!sid) {
          out.configure = { ok: false, error: "phone not found in account", lookup: lookupData };
        } else {
          const upd = await fetch(`${GATEWAY_URL}/IncomingPhoneNumbers/${sid}.json`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": TWILIO_API_KEY,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ SmsUrl: INBOUND_URL, SmsMethod: "POST" }),
          });
          const updData = await upd.json();
          out.configure = {
            ok: upd.ok,
            sid,
            sms_url: updData?.sms_url,
            status: upd.status,
          };
        }
      } catch (e) {
        out.configure = { ok: false, error: e instanceof Error ? e.message : "fail" };
      }
    }
  }

  // 2. Synthetic signed inbound test
  if (action === "all" || action === "test") {
    if (!TWILIO_AUTH_TOKEN) {
      out.test = { ok: false, error: "TWILIO_AUTH_TOKEN missing" };
    } else {
      const params: Record<string, string> = {
        From: "+15558675309",
        To: TIDY_PHONE,
        Body: "Hi, do you clean in 33183?",
        MessageSid: "SM_signed_test_" + Date.now(),
      };
      const sortedKeys = Object.keys(params).sort();
      const data = INBOUND_URL + sortedKeys.map((k) => k + params[k]).join("");
      const signature = createHmac("sha1", TWILIO_AUTH_TOKEN).update(data).digest("base64");

      const resp = await fetch(INBOUND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Twilio-Signature": signature,
        },
        body: new URLSearchParams(params).toString(),
      });
      const body = await resp.text();
      out.test = { status: resp.status, ok: resp.ok, body: body.slice(0, 400) };
    }
  }

  return json(out, 200);
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
