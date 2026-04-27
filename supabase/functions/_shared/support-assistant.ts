// Shared assistant for SMS + Web support inbox.
// Reuses the chatbot_knowledge base. Returns reply + self-reported confidence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type SupportMsg = { role: "user" | "assistant"; content: string };

export type AssistantResult = {
  reply: string;
  confidence: number; // 0..1, model self-reported
  escalate: boolean;
  knowledge_used: boolean;
};

const FALLBACK_KNOWLEDGE =
  "Tidy Home Concierge LLC — Miami subscription home service (cleaning, lawn, detailing). Phone: (786) 829-1141. ZIPs: 33183, 33186, 33156.";

const STATIC_ACK =
  "Got your message — a real human gets back to you within 1 hour. — Tidy";

export async function runSupportAssistant(
  history: SupportMsg[],
  channel: "sms" | "web",
): Promise<AssistantResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return { reply: STATIC_ACK, confidence: 0, escalate: true, knowledge_used: false };
  }

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
  const knowledge_used = !!kbRow?.content?.trim();

  const channelGuide =
    channel === "sms"
      ? "This is an SMS conversation. Keep replies under 320 characters and friendly. No markdown."
      : "This is a website chat. Keep replies under 3 short sentences.";

  const systemPrompt = `You are Tidy's support assistant for ${channel.toUpperCase()} customers.

${channelGuide}

RULES:
- Answer ONLY using the BUSINESS KNOWLEDGE below. Never invent prices, ZIPs, hours, or policies.
- Be warm and brief.
- If the user asks something not covered, asks to book/cancel/reschedule, complains, or needs a real person — set escalate=true.
- Never claim to book, cancel, or reschedule visits yourself.
- If you escalate, your reply should be a brief acknowledgment that a teammate will follow up.

OUTPUT FORMAT (STRICT):
Return ONLY a single JSON object, no prose, no markdown fences:
{"reply": "<message to send to customer>", "confidence": <number between 0 and 1>, "escalate": <true|false>}

confidence guidance:
- 0.9+ if the answer is directly in BUSINESS KNOWLEDGE and you're sure.
- 0.7-0.89 if you're mostly sure but inferring slightly.
- below 0.7 if you're guessing — and you should also set escalate=true.

BUSINESS KNOWLEDGE:
${knowledge}`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, ...history],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      console.error("[support-assistant] gateway error", aiResp.status, await aiResp.text());
      return { reply: STATIC_ACK, confidence: 0, escalate: true, knowledge_used };
    }

    const data = await aiResp.json();
    const raw = data?.choices?.[0]?.message?.content ?? "";
    let parsed: { reply?: string; confidence?: number; escalate?: boolean } = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to salvage a JSON blob from inside text.
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* noop */ }
      }
    }

    const reply = (parsed.reply || "").toString().trim();
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;
    const escalate = parsed.escalate === true || confidence < 0.7 || !reply;

    if (!reply) {
      return { reply: STATIC_ACK, confidence: 0, escalate: true, knowledge_used };
    }

    return { reply, confidence, escalate, knowledge_used };
  } catch (e) {
    console.error("[support-assistant] error", e);
    return { reply: STATIC_ACK, confidence: 0, escalate: true, knowledge_used };
  }
}

export async function notifyAdminEmail(opts: {
  channel: "sms" | "web";
  customerLabel: string;
  inboundBody: string;
  aiDraft: string | null;
  conversationId: string;
  escalated: boolean;
  confidence: number;
}): Promise<{ ok: boolean; error?: string }> {
  const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
  if (!BREVO_API_KEY) return { ok: false, error: "BREVO_API_KEY not set" };

  const adminEmail = "admin@jointidy.co";
  const conversationUrl = `https://jointidy.co/admin/inbox?c=${opts.conversationId}`;
  const subject = opts.escalated
    ? `🚨 Tidy support: ${opts.channel.toUpperCase()} from ${opts.customerLabel}`
    : `🤖 Tidy support: AI replied to ${opts.customerLabel}`;

  const html = `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; padding: 16px;">
      <h2 style="margin:0 0 8px;">${opts.escalated ? "Needs human reply" : "AI auto-handled"}</h2>
      <p style="margin:0 0 16px; color:#555;">
        Channel: <b>${opts.channel.toUpperCase()}</b> · From: <b>${opts.customerLabel}</b>
        · AI confidence: <b>${(opts.confidence * 100).toFixed(0)}%</b>
      </p>
      <div style="background:#f5f5f5; padding:12px; border-radius:8px; margin-bottom:12px;">
        <div style="font-size:12px; text-transform:uppercase; color:#777;">Customer message</div>
        <div style="white-space:pre-wrap;">${escapeHtml(opts.inboundBody)}</div>
      </div>
      ${opts.aiDraft ? `
      <div style="background:#eef6ff; padding:12px; border-radius:8px; margin-bottom:12px;">
        <div style="font-size:12px; text-transform:uppercase; color:#246;">AI ${opts.escalated ? "draft (NOT sent)" : "reply (sent)"}</div>
        <div style="white-space:pre-wrap;">${escapeHtml(opts.aiDraft)}</div>
      </div>` : ""}
      <a href="${conversationUrl}"
         style="display:inline-block; background:#1a73e8; color:#fff; padding:10px 16px;
                border-radius:6px; text-decoration:none;">Open conversation</a>
    </div>
  `.trim();

  try {
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: "Tidy Support", email: "noreply@jointidy.co" },
        to: [{ email: adminEmail, name: "Tidy Admin" }],
        subject,
        htmlContent: html,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("[notifyAdminEmail] brevo error", resp.status, t);
      return { ok: false, error: `brevo ${resp.status}: ${t.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[notifyAdminEmail] failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
