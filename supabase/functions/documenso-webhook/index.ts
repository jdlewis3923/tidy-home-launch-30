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
import { reportCandidateFailure } from "../_shared/candidate-failure.ts";
import { agreementPdf, etTime } from "../_shared/contract-pdf.ts";




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
    return Object.entries(ids).some(([k, v]) => !k.endsWith("_url") && !k.endsWith("_version") && String(v) === docIdStr);
  });

  if (!match) {
    return jsonResponse({ ok: true, no_match: true, document_id: docIdStr });
  }

  return jsonResponse(await commitDocumensoSignature(sb, match, docIdStr, payload));
});

// Commits a completed Documenso document through the SAME immutable path as the in-app signer
// (contract_commit_signature → post-sign chain), then provisions access and dispatches the welcome step.
async function commitDocumensoSignature(sb: any, match: any, docId: string, payload: Record<string, any>) {
  const fail = async (reason: string) => {
    await reportCandidateFailure(sb, { surface: "documenso", reason, applicantId: match.id, detail: { document_id: docId } });
    return { ok: false, error: reason, applicant_id: match.id };
  };
  try {
    const { data: a } = await sb.from("applicants").select("*").eq("id", match.id).single();
    if (a.contracts_signed) return { ok: true, already: true, applicant_id: a.id };
    const { data: p } = await sb.from("contractor_pipeline").select("service,proof_approved_at,archived,state").eq("applicant_id", a.id).maybeSingle();
    const raw = String(p?.service ?? a.service ?? "").toLowerCase();
    const service = raw.includes("clean") ? "cleaning" : raw.includes("lawn") ? "lawn" : null;
    if (!service) return await fail("no_supported_service");
    const { data: t } = await sb.from("contract_templates").select("*").eq("service", service).eq("lang", "en").eq("is_current", true).maybeSingle();
    if (!t) return await fail("no_current_template");
    if (a.contract_template_id !== t.id) await sb.from("applicants").update({ contract_template_id: t.id }).eq("id", a.id).eq("contracts_signed", false);
    const { data: body, error: be } = await sb.rpc("contract_scope_body", { _template: t.id });
    if (be) return await fail(`scope_body:${be.message}`);
    const rec = (payload.payload?.recipients ?? payload.data?.recipients ?? [])[0] ?? {};
    const typed = String(rec.name || `${a.first_name ?? ""} ${a.last_name ?? ""}`).trim();
    const signedAt = new Date(rec.signedAt ?? payload.payload?.completedAt ?? Date.now());
    let bytes: Uint8Array | null = null;
    const key = Deno.env.get("DOCUMENSO_API_KEY");
    if (key && !docId.startsWith("selftest-")) {
      try {
        const r = await fetch(`https://app.documenso.com/api/v1/documents/${encodeURIComponent(docId)}/download`, { headers: { Authorization: key } });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.downloadUrl) { const f = await fetch(j.downloadUrl); if (f.ok) bytes = new Uint8Array(await f.arrayBuffer()); }
      } catch { /* fall through to our own audit PDF */ }
    }
    const values = { legal_name: typed, business_name: "—", phone: a.phone ?? "—", email: a.email ?? "—", pro_number: a.pro_number ?? "Assigned at signing", signed_date: signedAt.toLocaleDateString("en-US", { timeZone: "America/New_York", dateStyle: "long" }) };
    if (!bytes) bytes = await agreementPdf(body, values, { "Contractor signature": typed, "Signed": etTime(signedAt), "Signed via": `Documenso document ${docId}`, "Template service": service, "Template version": t.version });
    const path = `contracts/signed/${a.id}/documenso-${crypto.randomUUID()}.pdf`;
    const up = await sb.storage.from("company-docs").upload(path, bytes, { contentType: "application/pdf" });
    if (up.error) return await fail(`pdf_upload:${up.error.message}`);
    const { error: ce } = await sb.rpc("contract_commit_signature", { _applicant: a.id, _template: t.id, _document: null, _version: t.version, _body: body, _typed: typed, _business: "—", _ip: "documenso", _ua: "documenso-webhook", _path: path, _values: { ...values, documenso_document_id: docId }, _signed_at: signedAt.toISOString() });
    if (ce) return await fail(`commit:${ce.message}`);
    const call = (fn: string, b: unknown) => fetch(`${SUPABASE_URL}/functions/v1/${fn}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` }, body: JSON.stringify(b) });
    const acc = await call("sequence-advance", { action: "signing_day_signed", applicant_id: a.id });
    if (!acc.ok) await reportCandidateFailure(sb, { surface: "documenso", reason: `post_sign_access:${(await acc.json().catch(() => ({})))?.error ?? acc.status}`, applicantId: a.id });
    const w = await call("pipeline-welcome-t1", { applicant_id: a.id });
    if (!w.ok) await reportCandidateFailure(sb, { surface: "documenso", reason: `welcome_${w.status}`, applicantId: a.id });
    return { ok: true, applicant_id: a.id, contracts_signed: true, via: "documenso" };
  } catch (e) {
    return await fail(`exception:${e instanceof Error ? e.message : String(e)}`);
  }
}
