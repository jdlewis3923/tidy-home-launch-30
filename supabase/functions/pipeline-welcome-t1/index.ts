import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * pipeline-welcome-t1 — fired by the database the moment the Pro signs
 * (contracts_signed). Sends the existing WELCOME-T1 template once and stamps
 * welcome_t1_sent_at. Service-role only; no other contractor message is sent.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { requireServiceOrAdmin } from "../_shared/admin-auth.ts";
import { sendBrevoEmail } from "../_shared/brevo-send.ts";
import { EMAIL, missingRequiredParams } from "../_shared/emailTemplates.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const { applicant_id } = await req.json().catch(() => ({}));
  if (typeof applicant_id !== "string") return jsonResponse({ error: "applicant_id required" }, 400);

  const { data: p } = await admin.from("contractor_pipeline").select("welcome_t1_sent_at, ica_countersigned_at, is_test").eq("applicant_id", applicant_id).maybeSingle();
  const { data: a } = await admin.from("applicants").select("email, first_name, contracts_signed, is_test_row").eq("id", applicant_id).maybeSingle();
  // Fires the moment the Pro signs (countersign no longer required for the welcome).
  if (!p || (!p.ica_countersigned_at && !a?.contracts_signed)) return jsonResponse({ ok: false, error: "not_signed" }, 409);
  if (p.welcome_t1_sent_at) return jsonResponse({ ok: true, skipped: "already_sent" });
  if (p.is_test || a?.is_test_row) {
    await admin.from("onboarding_events").insert({ applicant_id, event: "welcome_t1_test_skip", metadata: { would_send: ["WELCOME-T1 email", "insurance_instructions sms+email"] } });
    return jsonResponse({ ok: true, skipped: "test_candidate" });
  }

  const fail = async (msg: string) => {
    await admin.from("email_send_log").insert({ template_name: "WELCOME-T1", channel: "email", recipient: a?.email ?? null, triggered_by: "pipeline-welcome-t1", status: "failed", error_message: msg, payload: { applicant_id } });
    await admin.from("admin_alerts").insert({ level: "action", category: "hiring", title: "WELCOME-T1 did not send", detail: `${a?.first_name ?? "Candidate"}: ${msg}`, dedupe_key: `welcome-t1:${applicant_id}` }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: msg }, 502);
  };
  if (!a?.email) return fail("no email on file");
  const params = { first_name: a.first_name ?? "there", tier_name: "Tidy Verified Pro", tier_label: "Tier 1 — Tidy Verified Pro", tier_progression_url: "https://jointidy.co/pro/tier-progression" };
  const missing = missingRequiredParams(EMAIL.CONTRACTOR_WELCOME_T1, params);
  if (missing.length) return fail(`missing params: ${missing.join(", ")}`);
  const res = await sendBrevoEmail({ templateId: EMAIL.CONTRACTOR_WELCOME_T1, to: [{ email: a.email, name: a.first_name ?? undefined }], params, tags: ["WELCOME-T1"], marketing: false, label: "pipeline-welcome-t1" });
  if (!res.sent) return fail(res.reason ?? "send failed");
  await admin.from("email_send_log").insert({ template_name: "WELCOME-T1", channel: "email", recipient: a.email, triggered_by: "pipeline-welcome-t1", status: "sent", payload: { applicant_id } });
  const { error } = await admin.rpc("pipeline_mark_welcome_sent", { _id: applicant_id });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  // On signature: WELCOME-T1 (above, unchanged) plus the insurance quote instructions.
  const ins = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/pipeline-notify`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ applicant_id, event: "insurance_instructions" }),
  }).then((r) => r.status, () => 0);
  return jsonResponse({ ok: true, insurance_instructions: ins });
});
