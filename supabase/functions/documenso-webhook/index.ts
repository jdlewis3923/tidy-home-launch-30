import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Documenso webhook receiver (signature-verified, fail-closed)
//
// Each applicant signs ONE bundled envelope (cleaning | lawn | detail).
// On `document.completed` we flip applicants.contracts_signed = true and
// applicants.current_stage = 'CONTRACTS_DONE'.
//
// SECURITY: this endpoint used to accept ANY unsigned POST, so anyone who knew
// a document id could self-advance an applicant into a paid stage. It now
// requires a verified Documenso signature and FAILS CLOSED:
//   - DOCUMENSO_WEBHOOK_SECRET unset/empty  -> 401, nothing written
//   - signature header missing              -> 401, nothing written
//   - signature header mismatch             -> 401, nothing written
// Rejections log only the failing header NAME and the document id — never the
// header value, the signature, or any part of the secret.
//
// Configure in Documenso → Webhooks pointing at:
//   https://<project>.supabase.co/functions/v1/documenso-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { sendBrevoEmail as sendViaBrevo } from "../_shared/brevo-send.ts";
import { EMAIL, missingRequiredParams } from "../_shared/emailTemplates.ts";
import { readEnv } from "../_shared/handlerEnv.ts";




const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Documenso sends the webhook secret as a plain header; self-hosted/newer
// builds may instead send an HMAC-SHA256 of the raw body. We accept either,
// but only when it verifies against DOCUMENSO_WEBHOOK_SECRET.
const SECRET_HEADER = "X-Documenso-Secret";
const SIGNATURE_HEADER = "X-Documenso-Signature";

/** Length-independent constant-time string comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare fixed-width digests so length differences leak nothing.
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

function extractDocId(payload: Record<string, any> | null): string | null {
  if (!payload) return null;
  const raw =
    payload.payload?.id ??
    payload.data?.id ??
    payload.document?.id ??
    payload.documentId ??
    payload.id;
  return raw === undefined || raw === null ? null : String(raw);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  // Health probe: no side effect, reports which secrets are missing.
  if (req.method === "GET") {
    const { missing } = readEnv([
      "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "BREVO_API_KEY", "DOCUMENSO_WEBHOOK_SECRET",
    ] as const);
    return jsonResponse({ ok: missing.length === 0, function: "documenso-webhook", missing_env: missing }, 200);
  }
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  // ---- FAIL-CLOSED SIGNATURE GATE (runs before any table write) ----
  const rawBody = await req.text();
  let payload: Record<string, any> | null = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = null;
  }
  const docIdForLog = extractDocId(payload) ?? "unknown";

  const secret = (Deno.env.get("DOCUMENSO_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) {
    console.warn(
      `[documenso-webhook] rejected: DOCUMENSO_WEBHOOK_SECRET not configured; header=${SECRET_HEADER}; document_id=${docIdForLog}`,
    );
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  const secretHeaderValue = req.headers.get(SECRET_HEADER);
  const signatureHeaderValue = req.headers.get(SIGNATURE_HEADER);
  if (!secretHeaderValue && !signatureHeaderValue) {
    console.warn(
      `[documenso-webhook] rejected: missing signature header=${SECRET_HEADER}; document_id=${docIdForLog}`,
    );
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  let verified = false;
  let failedHeader = SECRET_HEADER;
  if (secretHeaderValue) {
    verified = timingSafeEqual(secretHeaderValue.trim(), secret);
    failedHeader = SECRET_HEADER;
  }
  if (!verified && signatureHeaderValue) {
    const expected = await hmacHex(secret, rawBody);
    const provided = signatureHeaderValue.trim().replace(/^sha256=/i, "").toLowerCase();
    verified = timingSafeEqual(provided, expected);
    failedHeader = SIGNATURE_HEADER;
  }
  if (!verified) {
    console.warn(
      `[documenso-webhook] rejected: signature mismatch on header=${failedHeader}; document_id=${docIdForLog}`,
    );
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }
  // ---- END GATE: past this point the request is authenticated ----

  if (!payload) return jsonResponse({ error: "invalid_json" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await sb.from("integration_logs").insert({
    source: "internal",
    event: "documenso.webhook",
    status: "success",
  }).then(() => {}, () => {});

  const event = (payload.event ?? payload.type ?? "").toString();
  const docId = extractDocId(payload);

  if (event !== "document.completed" || !docId) {
    return jsonResponse({ ok: true, ignored: true, event });
  }

  const docIdStr = String(docId);


  // Find the applicant whose documenso_document_ids.envelope == this id
  const { data: applicants, error } = await sb
    .from("applicants")
    .select("id, first_name, email, documenso_document_ids, contracts_signed")
    .filter("documenso_document_ids", "cs", JSON.stringify({}))
    .limit(1000);

  if (error) return jsonResponse({ error: error.message }, 500);

  const match = (applicants ?? []).find((a) => {
    const ids = (a.documenso_document_ids ?? {}) as Record<string, string>;
    return Object.values(ids).some((v) => String(v) === docIdStr);
  });

  if (!match) {
    return jsonResponse({ ok: true, no_match: true, document_id: docIdStr });
  }

  await sb.from("admin_alerts").insert({
    alert_type: "documenso_envelope_signed",
    title: `Contractor envelope signed by applicant ${match.id}`,
    body: null,
    context: { applicant_id: match.id, document_id: docIdStr },
  });

  const wasFirstSign = !match.contracts_signed;
  if (wasFirstSign) {
    await sb
      .from("applicants")
      .update({
        contracts_signed: true,
        contracts_signed_at: new Date().toISOString(),
        current_stage: "CONTRACTS_DONE",
        stage_entered_at: new Date().toISOString(),
      })
      .eq("id", match.id);

    // Fire WELCOME-T1 (Tier 1 — Tidy Verified Pro welcome) via Brevo.
    // Congratulates the new Pro on joining at Tier 1, teases Tier 2,
    // and links to /pro/tier-progression for the full explainer.
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    const TIER_PROGRESSION_URL = "https://jointidy.co/pro/tier-progression";
    // Single source of truth: the email template registry. No env var, no
    // app_settings lookup, no inline HTML fallback — that dual path is exactly
    // how the welcome mail drifted and template 64 never sent.
    const welcomeTemplateId = EMAIL.CONTRACTOR_WELCOME_T1;
    if (BREVO_API_KEY && match.email) {
      try {
        const params = {
          first_name: match.first_name ?? "there",
          tier_name: "Tidy Verified Pro",
          tier_label: "Tier 1 — Tidy Verified Pro",
          tier_progression_url: TIER_PROGRESSION_URL,
        };
        const missingParams = missingRequiredParams(welcomeTemplateId, params);
        if (missingParams.length > 0) {
          const err = `MISSING_PARAMS: CONTRACTOR_WELCOME_T1 requires ${missingParams.join(", ")}`;
          console.error(`[documenso-webhook] ${err}`);
          await sb.from("integration_logs").insert({
            source: "internal",
            event: "brevo.missing_params:CONTRACTOR_WELCOME_T1",
            status: "error",
            error_message: err,
          }).then(() => {}, () => {});
          throw new Error(err);
        }
        // Contractor onboarding welcome — relationship mail, marketing: false.
        const res = await sendViaBrevo({
            templateId: welcomeTemplateId,
            to: [{ email: match.email, name: match.first_name ?? undefined }],
            params,
            tags: ["WELCOME-T1"],
            marketing: false,
            label: "documenso-webhook",
        });

        await sb.from("email_send_log").insert({
          template_name: "WELCOME-T1",
          channel: "brevo",
          recipient: match.email,
          triggered_by: "documenso-webhook",
          status: res.sent ? "sent" : "failed",
          error_message: res.sent ? null : (res.reason ?? "send failed"),

          payload: { applicant_id: match.id },
        });
      } catch (e) {
        await sb.from("email_send_log").insert({
          template_name: "WELCOME-T1",
          channel: "brevo",
          recipient: match.email,
          triggered_by: "documenso-webhook",
          status: "failed",
          error_message: e instanceof Error ? e.message : String(e),
          payload: { applicant_id: match.id },
        });
      }
    }
  }

  return jsonResponse({
    ok: true,
    applicant_id: match.id,
    contracts_signed: true,
  });
});
