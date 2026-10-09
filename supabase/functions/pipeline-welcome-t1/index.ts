import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * pipeline-welcome-t1 — fired by the database the moment ica_countersigned_at
 * is written (stage 3). Sends the existing WELCOME-T1 template once and stamps
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

  const { data: p } = await admin.from("contractor_pipeline").select("welcome_t1_sent_at, ica_countersigned_at").eq("applicant_id", applicant_id).maybeSingle();
  if (!p?.ica_countersigned_at) return jsonResponse({ ok: false, error: "not_countersigned" }, 409);
  if (p.welcome_t1_sent_at) return jsonResponse({ ok: true, skipped: "already_sent" });
  const { data: a } = await admin.from("applicants").select("email, first_name").eq("id", applicant_id).maybeSingle();

  const fail = async (msg: string) => {
    await admin.from("email_send_log").insert({ template_name: "WELCOME-T1", channel: "brevo", recipient: a?.email ?? null, triggered_by: "pipeline-welcome-t1", status: "failed", error_message: msg, payload: { applicant_id } });
    await admin.from("admin_alerts").insert({ level: "action", category: "hiring", title: "WELCOME-T1 did not send", detail: `${a?.first_name ?? "Candidate"}: ${msg}`, dedupe_key: `welcome-t1:${applicant_id}` }).then(() => {}, () => {});
    return jsonResponse({ ok: false, error: msg }, 502);
  };
  if (!a?.email) return fail("no email on file");
  const params = { first_name: a.first_name ?? "there", tier_name: "Tidy Verified Pro", tier_label: "Tier 1 — Tidy Verified Pro", tier_progression_url: "https://jointidy.co/pro/tier-progression" };
  const missing = missingRequiredParams(EMAIL.CONTRACTOR_WELCOME_T1, params);
  if (missing.length) return fail(`missing params: ${missing.join(", ")}`);
  const res = await sendBrevoEmail({ templateId: EMAIL.CONTRACTOR_WELCOME_T1, to: [{ email: a.email, name: a.first_name ?? undefined }], params, tags: ["WELCOME-T1"], marketing: false, label: "pipeline-welcome-t1" });
  if (!res.sent) return fail(res.reason ?? "send failed");
  await admin.from("email_send_log").insert({ template_name: "WELCOME-T1", channel: "brevo", recipient: a.email, triggered_by: "pipeline-welcome-t1", status: "sent", payload: { applicant_id } });
  const { error } = await admin.rpc("pipeline_mark_welcome_sent", { _id: applicant_id });
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  return jsonResponse({ ok: true });
});
