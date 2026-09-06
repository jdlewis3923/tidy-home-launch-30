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
import { sendBrevoEmail as sendViaBrevo } from "../_shared/brevo-send.ts";
import { EMAIL, missingRequiredParams } from "../_shared/emailTemplates.ts";



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
