// Tidy — Send Documenso envelope (one bundled envelope per applicant)
//
// Each contractor signs ONE envelope keyed by their service role
// (cleaning | lawn | detail). The envelope contains the service contract
// + merged W-9/Direct Deposit form. Stores the returned Documenso documentId
// on applicants.documenso_document_ids as { envelope: <id> }.
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
const SERVICE_ROLES = ["cleaning", "lawn", "detail"] as const;
type ServiceRole = (typeof SERVICE_ROLES)[number];

function normalizeServiceRole(raw: string | null | undefined): ServiceRole | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s.includes("clean")) return "cleaning";
  if (s.includes("lawn") || s.includes("yard")) return "lawn";
  if (s.includes("detail") || s.includes("car")) return "detail";
  if ((SERVICE_ROLES as readonly string[]).includes(s)) return s as ServiceRole;
  return null;
}

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
          subject: `Tidy — please sign your contractor envelope`,
          message:
            `Hi ${applicant.first_name}, please review and sign your contractor envelope to finish onboarding with Tidy.`,
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
    .select("id, first_name, last_name, email, service, role, documenso_document_ids")
    .eq("id", parsed.data.applicant_id)
    .maybeSingle();
  if (aErr || !applicant) {
    return jsonResponse({ error: "applicant_not_found" }, 404);
  }

  const serviceRole =
    normalizeServiceRole(applicant.service) ?? normalizeServiceRole(applicant.role);
  if (!serviceRole) {
    return jsonResponse(
      {
        error: "unknown_service_role",
        hint: "applicant.service must map to one of: cleaning, lawn, detail",
        got: { service: applicant.service, role: applicant.role },
      },
      400,
    );
  }

  const { data: tpl, error: tErr } = await sb
    .from("documenso_templates")
    .select("doc_type, template_id, label")
    .eq("doc_type", serviceRole)
    .maybeSingle();
  if (tErr) return jsonResponse({ error: tErr.message }, 500);
  if (!tpl?.template_id) {
    return jsonResponse(
      {
        error: "template_not_configured",
        service_role: serviceRole,
        hint: "Set the template ID at /admin/documenso-templates",
      },
      400,
    );
  }

  // Idempotency: if already sent, return the stored id.
  const existing = (applicant.documenso_document_ids ?? {}) as Record<string, string>;
  if (existing.envelope) {
    return jsonResponse({ ok: true, document_ids: existing, already_sent: true });
  }

  try {
    const id = await generateDoc(
      tpl.template_id,
      {
        first_name: applicant.first_name,
        last_name: applicant.last_name,
        email: applicant.email,
      },
      tpl.label,
    );
    const docIds = { envelope: id, service_role: serviceRole };
    await sb
      .from("applicants")
      .update({
        documenso_document_ids: docIds,
        current_stage: "offer_sent",
        stage_entered_at: new Date().toISOString(),
      })
      .eq("id", applicant.id);
    return jsonResponse({ ok: true, document_ids: docIds });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: msg }, 502);
  }
});
