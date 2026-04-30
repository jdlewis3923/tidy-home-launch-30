/**
 * Tidy — Social Launch Publisher
 *
 * Runs every 5 minutes via pg_cron. Finds armed posts whose
 * scheduled_for is due, publishes them to the right channel.
 *
 *  - meta_combined / instagram / facebook → Meta Graph API
 *      (uses META_PAGE_ACCESS_TOKEN secret + cached META_IG_USER_ID/META_FB_PAGE_ID
 *       from existing CAPI vault entries)
 *  - nextdoor → POST to ZAPIER_NEXTDOOR_WEBHOOK_URL
 *      (if missing: insert admin_alerts row + log to email_send_log so
 *       /admin/email-health surfaces it; do NOT mark as posted)
 *
 * Auth: invoked by cron (no JWT) and admin "Test fire" button.
 * verify_jwt=false; we never accept caption/image_url from the request body.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH = "https://graph.facebook.com/v19.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Post = {
  id: string;
  channel: "nextdoor" | "instagram" | "facebook" | "meta_combined";
  post_number: number;
  scheduled_for: string;
  caption: string;
  image_url: string | null;
  status: string;
};

async function vaultGet(sb: ReturnType<typeof createClient>, name: string): Promise<string | null> {
  const { data, error } = await sb.rpc("admin_get_meta_secret", { _name: name });
  if (error) {
    console.warn(`[social-launch-publisher] vault read ${name} failed: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

async function publishToMeta(post: Post, sb: ReturnType<typeof createClient>): Promise<{ ig?: string; fb?: string }> {
  const pageToken =
    Deno.env.get("META_PAGE_ACCESS_TOKEN") ||
    (await vaultGet(sb, "meta_fb_page_access_token"));
  const igUserId = await vaultGet(sb, "meta_ig_user_id");
  const fbPageId = await vaultGet(sb, "meta_fb_page_id");
  if (!pageToken) throw new Error("META_PAGE_ACCESS_TOKEN not configured");
  if (!post.image_url) throw new Error("post has no image_url");

  const result: { ig?: string; fb?: string } = {};
  const wantIg = post.channel === "instagram" || post.channel === "meta_combined";
  const wantFb = post.channel === "facebook" || post.channel === "meta_combined";

  if (wantIg && igUserId) {
    // Create container
    const cu = new URL(`${GRAPH}/${igUserId}/media`);
    cu.searchParams.set("access_token", pageToken);
    cu.searchParams.set("image_url", post.image_url);
    cu.searchParams.set("caption", post.caption);
    const cr = await fetch(cu.toString(), { method: "POST" });
    const cj = await cr.json();
    if (!cr.ok) throw new Error(`IG container failed: ${JSON.stringify(cj).slice(0, 300)}`);
    // Publish container
    const pu = new URL(`${GRAPH}/${igUserId}/media_publish`);
    pu.searchParams.set("access_token", pageToken);
    pu.searchParams.set("creation_id", cj.id);
    const pr = await fetch(pu.toString(), { method: "POST" });
    const pj = await pr.json();
    if (!pr.ok) throw new Error(`IG publish failed: ${JSON.stringify(pj).slice(0, 300)}`);
    result.ig = pj.id;
  }

  if (wantFb && fbPageId) {
    const fu = new URL(`${GRAPH}/${fbPageId}/photos`);
    fu.searchParams.set("access_token", pageToken);
    fu.searchParams.set("url", post.image_url);
    fu.searchParams.set("caption", post.caption);
    const fr = await fetch(fu.toString(), { method: "POST" });
    const fj = await fr.json();
    if (!fr.ok) throw new Error(`FB publish failed: ${JSON.stringify(fj).slice(0, 300)}`);
    result.fb = fj.post_id ?? fj.id;
  }
  return result;
}

async function publishToNextdoor(post: Post, sb: ReturnType<typeof createClient>): Promise<{ delivered: boolean; needs_manual: boolean }> {
  const url = Deno.env.get("ZAPIER_NEXTDOOR_WEBHOOK_URL");
  if (!url) {
    // Fallback: alert admin to post manually
    await sb.from("admin_alerts").insert({
      alert_type: "nextdoor_manual_post_required",
      title: `Nextdoor post #${post.post_number} ready to publish manually`,
      body: post.caption,
      context: { post_id: post.id, image_url: post.image_url, scheduled_for: post.scheduled_for },
    });
    await sb.from("email_send_log").insert({
      channel: "internal",
      template_name: "nextdoor_manual_post_required",
      recipient: "admin@jointidy.co",
      status: "failed",
      error_message: "ZAPIER_NEXTDOOR_WEBHOOK_URL not configured",
      payload: { post_id: post.id, post_number: post.post_number, image_url: post.image_url },
    });
    return { delivered: false, needs_manual: true };
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      post_id: post.id,
      post_number: post.post_number,
      caption: post.caption,
      image_url: post.image_url,
      scheduled_for: post.scheduled_for,
    }),
  });
  if (!r.ok) throw new Error(`Zapier webhook failed (${r.status})`);
  return { delivered: true, needs_manual: false };
}

async function processPost(sb: ReturnType<typeof createClient>, post: Post): Promise<{ ok: boolean; error?: string }> {
  try {
    if (post.channel === "nextdoor") {
      const r = await publishToNextdoor(post, sb);
      if (r.needs_manual) {
        // Leave status='armed', surface via admin_alerts
        return { ok: true };
      }
      await sb
        .from("social_launch_posts")
        .update({ status: "posted", posted_at: new Date().toISOString(), publish_error: null })
        .eq("id", post.id);
      return { ok: true };
    } else {
      const ids = await publishToMeta(post, sb);
      await sb
        .from("social_launch_posts")
        .update({
          status: "posted",
          posted_at: new Date().toISOString(),
          publish_error: null,
          notes: `ig:${ids.ig ?? "-"} fb:${ids.fb ?? "-"}`,
        })
        .eq("id", post.id);
      return { ok: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sb
      .from("social_launch_posts")
      .update({ status: "failed", publish_error: msg })
      .eq("id", post.id);
    await sb.from("email_send_log").insert({
      channel: "internal",
      template_name: "social_launch_publish_failed",
      recipient: "admin@jointidy.co",
      status: "failed",
      error_message: msg,
      payload: { post_id: post.id, channel: post.channel, post_number: post.post_number },
    });
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Optional: { post_id } for admin "Test fire" button
  let onlyId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.post_id === "string") onlyId = body.post_id;
    }
  } catch {/* ignore */}

  let q = sb
    .from("social_launch_posts")
    .select("id,channel,post_number,scheduled_for,caption,image_url,status")
    .is("posted_at", null);

  if (onlyId) {
    q = q.eq("id", onlyId);
  } else {
    q = q.eq("status", "armed").lte("scheduled_for", new Date().toISOString()).limit(20);
  }

  const { data: posts, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const p of (posts ?? []) as Post[]) {
    const r = await processPost(sb, p);
    results.push({ id: p.id, ...r });
  }
  return json({ processed: results.length, results });
});
