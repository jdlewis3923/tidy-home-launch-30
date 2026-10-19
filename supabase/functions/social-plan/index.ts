/**
 * social-plan — re-plans the social calendar from launch_config.
 * Runs nightly (cron), on every launch_config change (DB trigger), and from
 * /admin/social. Only status='scheduled' rows move; posted rows never change.
 *  { action: "plan" }                       re-plan and save (default)
 *  { action: "preview", anchors: {...} }    return the calendar for other dates, save nothing
 *  { action: "seed" }                       load the 43 launch-calendar posts once (idempotent)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireServiceOrAdmin } from "../_shared/admin-auth.ts";
import { isCronAuthorized } from "../_shared/cron-auth.ts";
import { planCalendar, type PlanAnchors, type PlanRow } from "../_shared/socialPlanner.ts";
import seedPosts from "../_shared/social-calendar-posts.json" with { type: "json" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const IMG = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/social-images/cal26-`;
const PHOTOS: Record<string, string> = { cleaning: "photo-cleaning.jpg", lawn: "photo-lawn.jpg", "car care": "photo-car-care.jpg", "three-service strip": "photo-three-service-strip.jpg" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);

// deno-lint-ignore no-explicit-any
async function anchorsFrom(sb: any): Promise<PlanAnchors> {
  const { data } = await sb.from("launch_config").select("scope, first_visit_date, conversion_date, hanger_drops");
  // deno-lint-ignore no-explicit-any
  const by = Object.fromEntries((data ?? []).map((r: any) => [r.scope, r]));
  const drops = (by.global?.hanger_drops ?? []) as { start: string }[];
  return { launch: by.cleaning?.first_visit_date ?? null, conversion: by.cleaning?.conversion_date ?? null, carLaunch: by.car?.first_visit_date ?? null, hangerDrop1: drops.map((x) => x.start).sort()[0] ?? null };
}
// deno-lint-ignore no-explicit-any
async function loadRows(sb: any): Promise<PlanRow[]> {
  const { data, error } = await sb.from("social_launch_posts")
    .select("id, post_number, channel, anchor_type, anchor_value, priority, not_before, drop_if_bumped, is_spare, status, scheduled_for")
    .eq("theme", "launch-calendar").is("archived_at", null).eq("manual_schedule", false);
  if (error) throw error;
  return data as PlanRow[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
  }
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const action = body?.action ?? "plan";

  if (action === "seed") {
    await sb.from("social_launch_posts").update({ archived_at: new Date().toISOString(), archive_reason: "Replaced by launch-tied calendar (13 Oct)" })
      .is("archived_at", null).in("status", ["draft", "pending", "skipped"]).or("theme.is.null,theme.neq.launch-calendar");
    const { data: have } = await sb.from("social_launch_posts").select("post_number").eq("theme", "launch-calendar").is("archived_at", null).eq("manual_schedule", false);
    const existing = new Set((have ?? []).map((r: { post_number: number }) => r.post_number));
    const rejected: { post: string; error: string }[] = [];
    // deno-lint-ignore no-explicit-any
    for (const p of (seedPosts as any[]).filter((x) => !existing.has(x.post_number))) {
      const img = p.image_kind === "card" ? `card-${slug(p.image_subject)}.png` : PHOTOS[p.image_subject];
      const row = {
        channel: p.channel, post_number: p.post_number, title: `[${p.n}] ${p.image_subject}`, caption: p.template_copy, template_copy: p.template_copy,
        image_url: img ? IMG + img : null, image_subject: `${p.image_kind}: ${p.image_subject}`, image_flag: img ? null : `No matching app image for "${p.image_subject}"`,
        anchor_type: p.anchor_type, anchor_value: p.anchor_value, priority: p.priority, not_before: p.not_before, drop_if_bumped: p.drop_if_bumped, is_spare: p.is_spare,
        theme: "launch-calendar", status: "draft", scheduled_for: null,
      };
      const { data: ins, error } = await sb.from("social_launch_posts").insert(row).select("id").single();
      if (error) { rejected.push({ post: p.n, error: error.message }); continue; }
      const { error: e2 } = await sb.from("social_launch_posts").update({ status: "scheduled" }).eq("id", ins.id);
      if (e2) rejected.push({ post: p.n, error: e2.message });
    }
    return json({ seeded: (seedPosts as unknown[]).length, rejected });
  }

  const rows = await loadRows(sb);
  const anchors: PlanAnchors = action === "preview" ? { ...(await anchorsFrom(sb)), ...(body.anchors ?? {}) } : await anchorsFrom(sb);
  const plan = planCalendar(rows, anchors);
  if (action === "preview") return json({ anchors, plan });

  const errors: { id: string; error: string }[] = [];
  for (const r of plan) {
    const { error } = await sb.from("social_launch_posts").update({ scheduled_for: r.scheduled_for, waiting_reason: r.waiting })
      .eq("id", r.id).eq("status", "scheduled");
    if (error) errors.push({ id: r.id, error: error.message });
  }
  return json({ anchors, planned: plan.filter((r) => r.date).length, waiting: plan.filter((r) => !r.date).length, errors });
});
