// Tidy — Meta post rollback (delete IG/FB posts via Graph API, reset DB row).
//
// Body: { post_id: string }
// Looks up the social_posts row, deletes the live IG and/or FB posts via
// Graph API DELETE, clears the IDs in DB, and sets status to 'paused'
// with an explanatory error_message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function vaultGet(sb: ReturnType<typeof createClient>, name: string): Promise<string | null> {
  const { data, error } = await sb.rpc("admin_get_meta_secret", { _name: name });
  if (error) {
    console.warn(`[meta-rollback-post] vault read ${name} failed: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

async function graphDelete(id: string, token: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const url = `${GRAPH}/${id}?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: "DELETE" });
  let body: unknown = null;
  try { body = await res.json(); } catch (_e) { body = null; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { post_id?: string } = {};
  try { body = await req.json(); } catch (_e) {}
  const postId = body?.post_id;
  if (!postId || typeof postId !== "string") {
    return json({ error: "post_id required" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: post, error: loadErr } = await sb
    .from("social_posts")
    .select("id, day_number, ig_post_id, fb_post_id, status")
    .eq("id", postId)
    .maybeSingle();
  if (loadErr) return json({ error: `load failed: ${loadErr.message}` }, 500);
  if (!post) return json({ error: "post not found" }, 404);

  const fbToken = await vaultGet(sb, "meta_fb_page_access_token");
  const userToken = await vaultGet(sb, "meta_user_access_token");

  const results: Record<string, unknown> = {};

  if (post.fb_post_id) {
    if (!fbToken) {
      results.fb = { ok: false, error: "meta_fb_page_access_token missing in vault" };
    } else {
      results.fb = await graphDelete(post.fb_post_id, fbToken);
    }
  }

  if (post.ig_post_id) {
    // IG media is deleted with the user token (instagram_content_publish scope)
    if (!userToken) {
      results.ig = { ok: false, error: "meta_user_access_token missing in vault" };
    } else {
      results.ig = await graphDelete(post.ig_post_id, userToken);
    }
  }

  const fbOk = !post.fb_post_id || (results.fb as { ok?: boolean })?.ok === true;
  const igOk = !post.ig_post_id || (results.ig as { ok?: boolean })?.ok === true;
  const allOk = fbOk && igOk;

  const note = allOk
    ? `Rolled back ${new Date().toISOString()}: ${post.fb_post_id ? "FB post deleted" : "no FB post"}, ${post.ig_post_id ? "IG post deleted" : "IG never published"}. Timing bug fixed for next attempt.`
    : `Rollback partial: ${JSON.stringify(results).slice(0, 800)}`;

  const { error: updErr } = await sb
    .from("social_posts")
    .update({
      ig_post_id: null,
      fb_post_id: null,
      posted_at: null,
      status: "paused",
      error_message: note,
    })
    .eq("id", postId);
  if (updErr) {
    return json({ ok: false, error: `db clear failed: ${updErr.message}`, results }, 500);
  }

  console.log(`[meta-rollback-post] day=${post.day_number} fbOk=${fbOk} igOk=${igOk}`);
  return json({ ok: allOk, post_id: postId, day_number: post.day_number, results, note });
});
