// Tidy — Documenso webhook receiver
//
// Each applicant signs ONE bundled envelope (cleaning | lawn | detail).
// On `document.completed` we flip applicants.contracts_signed = true and
// applicants.current_stage = 'CONTRACTS_DONE'.
//
// Configure in Documenso → Webhooks pointing at:
//   https://<project>.supabase.co/functions/v1/documenso-webhook

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  const payload = await req.json().catch(() => null);
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

  // Find the applicant whose documenso_document_ids.envelope == this id
  const { data: applicants, error } = await sb
    .from("applicants")
    .select("id, documenso_document_ids, contracts_signed")
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

  if (!match.contracts_signed) {
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
    contracts_signed: true,
  });
});
