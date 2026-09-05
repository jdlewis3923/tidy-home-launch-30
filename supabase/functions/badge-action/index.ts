/**
 * badge-action — admin-only lifecycle actions for Pro badges.
 *
 * Actions:
 *   issue    — assign a Pro number + verify token and set status to active.
 *   suspend  — set status to suspended.
 *   reinstate— set status to active.
 *   revoke   — set status to revoked.
 *
 * Every change is logged to badge_status_log.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const ActionSchema = z.object({
  applicant_id: z.string().uuid(),
  action: z.enum(["issue", "suspend", "reinstate", "revoke"]),
  note: z.string().max(500).optional(),
});

const bad = (message: string, status = 400) =>
  new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return bad("Missing authorization", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: user, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user.user) return bad("Unauthorized", 401);

  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.user.id, _role: "admin" });
  if (!isAdmin) return bad("Forbidden", 403);

  let body: z.infer<typeof ActionSchema>;
  try {
    const parsed = ActionSchema.safeParse(await req.json());
    if (!parsed.success) return bad(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    body = parsed.data;
  } catch {
    return bad("Invalid JSON");
  }

  const { applicant_id, action, note } = body;

  const { data: applicant, error: fetchErr } = await supabase
    .from("applicants")
    .select("id, badge_status, pro_number, verify_token")
    .eq("id", applicant_id)
    .single();
  if (fetchErr || !applicant) return bad("Applicant not found", 404);

  let newStatus: string;
  let update: Record<string, unknown> = {};

  if (action === "issue") {
    if (applicant.badge_status === "active") return bad("Badge is already active");
    newStatus = "active";
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: proNum } = await supabase.rpc("nextval", { seq_name: "pro_number_seq" });
    update = {
      badge_status: "active",
      verify_token: applicant.verify_token || token,
      pro_number: applicant.pro_number || `TIDY-${String(proNum ?? 1).padStart(4, "0")}`,
    };
  } else {
    newStatus = action === "suspend" ? "suspended" : action === "revoke" ? "revoked" : "active";
    if (applicant.badge_status === newStatus) return bad(`Badge is already ${newStatus}`);
    update = { badge_status: newStatus };
  }

  const { error: updErr } = await supabase
    .from("applicants")
    .update(update)
    .eq("id", applicant_id);
  if (updErr) return bad(updErr.message, 500);

  const { error: logErr } = await supabase.from("badge_status_log").insert({
    applicant_id,
    old_status: applicant.badge_status,
    new_status: newStatus,
    changed_by: user.user.id,
    note: note || `${action} via badge admin`,
  });
  if (logErr) console.error("[badge-action] log insert failed:", logErr.message);

  return new Response(JSON.stringify({ ok: true, applicant_id, status: newStatus }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
