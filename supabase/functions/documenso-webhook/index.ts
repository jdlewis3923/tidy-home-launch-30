// Tidy — Documenso webhook receiver
//
// Listens for `document.completed` events. When an applicant has signed all
// 3 contractor envelopes (ICA, W-9, Direct Deposit), flips
// applicants.contracts_signed=true and current_stage='CONTRACTS_DONE'.
//
// Configure in Documenso → Webhooks pointing at:
//   https://<project>.supabase.co/functions/v1/documenso-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REQUIRED = ["ica", "w9", "direct_deposit"];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
  if (!payload) return jsonResponse({ error: "invalid_json" }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Best-effort log
  await sb.from("integration_logs").insert({
    source: "internal",
    event: "documenso.webhook",
    status: "success",
  }).then(() => {}, () => {});

  const event = (payload.event ?? payload.type ?? "").toString();
  const docId =
    payload.payload?.id ??
    payload.data?.id ??
    payload.document?.id ??
    payload.documentId ??
    payload.id;

  if (event !== "document.completed" || !docId) {
    return jsonResponse({ ok: true, ignored: true, event });
  }

  const docIdStr = String(docId);

  // Find the applicant whose documenso_document_ids contains this id
  const { data: applicants, error } = await sb
    .from("applicants")
    .select("id, documenso_document_ids, contracts_signed")
    .filter("documenso_document_ids", "cs", JSON.stringify({}))
    .limit(1000); // small table; fine

  if (error) return jsonResponse({ error: error.message }, 500);

  const match = (applicants ?? []).find((a) => {
    const ids = (a.documenso_document_ids ?? {}) as Record<string, string>;
    return Object.values(ids).some((v) => String(v) === docIdStr);
  });

  if (!match) {
    return jsonResponse({ ok: true, no_match: true, document_id: docIdStr });
  }

  // Track which doc just completed in admin_alerts (lightweight audit)
  const ids = (match.documenso_document_ids ?? {}) as Record<string, string>;
  const completedType = Object.keys(ids).find((k) => String(ids[k]) === docIdStr);

  await sb.from("admin_alerts").insert({
    alert_type: "documenso_doc_signed",
    title: `${completedType ?? "doc"} signed by applicant ${match.id}`,
    body: null,
    context: { applicant_id: match.id, doc_type: completedType, document_id: docIdStr },
  });

  // To know whether ALL 3 are signed we need cross-doc state. Documenso doesn't
  // tell us in a single event, so we maintain a `signed_doc_types` set in
  // documenso_document_ids by appending to a parallel jsonb key. Simplest:
  // query admin_alerts for distinct doc_types signed for this applicant.
  const { data: signedAlerts } = await sb
    .from("admin_alerts")
    .select("context")
    .eq("alert_type", "documenso_doc_signed")
    .contains("context", { applicant_id: match.id });

  const signedTypes = new Set<string>();
  for (const r of signedAlerts ?? []) {
    const t = (r.context as Record<string, unknown>)?.doc_type;
    if (typeof t === "string") signedTypes.add(t);
  }

  const allSigned = REQUIRED.every((t) => signedTypes.has(t));

  if (allSigned && !match.contracts_signed) {
    await sb
      .from("applicants")
      .update({
        contracts_signed: true,
        contracts_signed_at: new Date().toISOString(),
        current_stage: "CONTRACTS_DONE",
        stage_entered_at: new Date().toISOString(),
      })
      .eq("id", match.id);
  }

  return jsonResponse({
    ok: true,
    applicant_id: match.id,
    completed_doc_type: completedType,
    all_signed: allSigned,
  });
});
