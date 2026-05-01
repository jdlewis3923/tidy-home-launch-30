// Tidy — Send Documenso envelope (replaces HelloSign)
//
// Sends 3 contractor docs (ICA, W-9, Direct Deposit) to the applicant via
// Documenso's REST API. Stores returned documentId per doc_type in
// applicants.documenso_document_ids. Auth: admin user JWT OR service role.
//
// Body: { applicant_id: uuid }

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { handleCors, jsonResponse } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const DOCUMENSO_API_KEY = Deno.env.get("DOCUMENSO_API_KEY");
const DOCUMENSO_BASE = "https://app.documenso.com/api/v1";

const Body = z.object({ applicant_id: z.string().uuid() });

const DOC_TYPES = ["ica", "w9", "direct_deposit"] as const;
type DocType = (typeof DOC_TYPES)[number];

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  if (token === SERVICE_KEY) return true;
  try {
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error } = await sb.auth.getClaims(token);
    if (error || !claims?.claims?.sub) return false;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: row } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", claims.claims.sub)
      .eq("role", "admin")
      .maybeSingle();
    return !!row;
  } catch {
    return false;
  }
}

async function generateDoc(
  templateId: string,
  applicant: { first_name: string; last_name: string; email: string },
  label: string,
): Promise<string> {
  const res = await fetch(
    `${DOCUMENSO_BASE}/templates/${encodeURIComponent(templateId)}/generate-document`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DOCUMENSO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `${label} — ${applicant.first_name} ${applicant.last_name}`,
        recipients: [
          {
            name: `${applicant.first_name} ${applicant.last_name}`,
            email: applicant.email,
            role: "SIGNER",
          },
        ],
        meta: {
          subject: `Tidy — please sign your ${label}`,
          message:
            `Hi ${applicant.first_name}, please review and sign your ${label} to finish onboarding with Tidy.`,
        },
      }),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Documenso ${label} (${templateId}) failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  // Documenso returns { documentId, ... } or { id, ... } depending on version
  const id = (json.documentId ?? json.id ?? json.document?.id) as
    | string
    | number
    | undefined;
  if (!id) throw new Error(`Documenso ${label}: no documentId in response`);
  return String(id);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405);

  if (!DOCUMENSO_API_KEY) {
    return jsonResponse({ error: "DOCUMENSO_API_KEY not configured" }, 500);
  }
  if (!(await isAuthorized(req))) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { error: "invalid_body", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: applicant, error: aErr } = await sb
    .from("applicants")
    .select("id, first_name, last_name, email, documenso_document_ids")
    .eq("id", parsed.data.applicant_id)
    .maybeSingle();
  if (aErr || !applicant) {
    return jsonResponse({ error: "applicant_not_found" }, 404);
  }

  const { data: tpls, error: tErr } = await sb
    .from("documenso_templates")
    .select("doc_type, template_id, label");
  if (tErr) return jsonResponse({ error: tErr.message }, 500);

  const tplMap = new Map(
    (tpls ?? []).map((t) => [t.doc_type as string, { id: t.template_id, label: t.label }]),
  );
  const missing = DOC_TYPES.filter((d) => !tplMap.get(d)?.id);
  if (missing.length) {
    return jsonResponse(
      {
        error: "templates_not_configured",
        missing,
        hint: "Set template IDs at /admin/documenso-templates",
      },
      400,
    );
  }

  const docIds: Record<DocType, string> = { ...((applicant.documenso_document_ids as Record<DocType, string>) ?? {}) } as Record<DocType, string>;
  const errors: Array<{ doc_type: DocType; error: string }> = [];

  for (const docType of DOC_TYPES) {
    if (docIds[docType]) continue; // already sent — skip
    const t = tplMap.get(docType)!;
    try {
      const id = await generateDoc(
        t.id!,
        { first_name: applicant.first_name, last_name: applicant.last_name, email: applicant.email },
        t.label,
      );
      docIds[docType] = id;
    } catch (err) {
      errors.push({ doc_type: docType, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await sb
    .from("applicants")
    .update({
      documenso_document_ids: docIds,
      current_stage: "offer_sent",
      stage_entered_at: new Date().toISOString(),
    })
    .eq("id", applicant.id);

  return jsonResponse(
    { ok: errors.length === 0, document_ids: docIds, errors },
    errors.length === 0 ? 200 : 207,
  );
});
