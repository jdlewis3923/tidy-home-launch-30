// Tidy — Meta IG + FB auto-publisher.
//
// Triggered by:
//   - pg_cron (every minute, finds scheduled posts due to fire)
//   - Admin "Post now" button via supabase.functions.invoke("meta-publish-post", { body: { post_id } })
//
// Flow per post:
//   1. Load social_posts row, verify status in (scheduled|ready|failed) — set to 'posting'
//   2. Resolve public image URL from Supabase Storage (bucket is public)
//   3. Discover/cache META_IG_USER_ID, META_FB_PAGE_ID, META_FB_PAGE_ACCESS_TOKEN if missing
//   4. Publish to Instagram (create container → publish)
//   5. Publish to Facebook (POST /{page_id}/photos)
//   6. Update row → status=posted, posted_at, ig_post_id, fb_post_id
//   7. On failure → status=failed, error_message
//
// Auth: this function runs both as cron (no auth) and as admin invoke
// (with JWT). For simplicity verify_jwt=false; we re-check the post_id
// exists in our table before doing any work, and we never accept image
// URLs / captions from the request body.
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

function publicImageUrl(image_path: string): string {
  // image_path is stored as "social-images/<filename>". Strip bucket prefix.
  const key = image_path.startsWith("social-images/")
    ? image_path.substring("social-images/".length)
    : image_path;
  return `${SUPABASE_URL}/storage/v1/object/public/social-images/${encodeURI(key)}`;
}

function resolveImageUrls(post: { image_path: string; image_paths: string[] | null }): string[] {
  const arr = (post.image_paths ?? []).filter((s) => typeof s === "string" && s.length > 0);
  if (arr.length > 0) return arr.map(publicImageUrl);
  return [publicImageUrl(post.image_path)];
}

// ---------- vault helpers ----------

async function vaultGet(sb: ReturnType<typeof createClient>, name: string): Promise<string | null> {
  const { data, error } = await sb.rpc("admin_get_meta_secret", { _name: name });
  if (error) {
    console.warn(`[meta-publish-post] vault read ${name} failed: ${error.message}`);
    return null;
  }
  return (data as string | null) ?? null;
}

async function vaultSet(sb: ReturnType<typeof createClient>, name: string, value: string): Promise<void> {
  const { error } = await sb.rpc("admin_set_meta_secret", { _name: name, _value: value });
  if (error) throw new Error(`vault write ${name} failed: ${error.message}`);
}

// ---------- discovery (one-time, cached to vault) ----------

async function discoverIgUserId(userToken: string, businessId: string | null): Promise<string> {
  // Strategy: walk /me/accounts (pages) → look up instagram_business_account on each.
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("access_token", userToken);
  url.searchParams.set("fields", "id,name,instagram_business_account");
  url.searchParams.set("limit", "100");
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`/me/accounts failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`);
  }
  const pages = (data.data ?? []) as Array<{ id: string; name?: string; instagram_business_account?: { id: string } }>;
  for (const p of pages) {
    if (p.instagram_business_account?.id) {
      console.log(`[meta-publish-post] Discovered IG user id ${p.instagram_business_account.id} via page "${p.name}"`);
      return p.instagram_business_account.id;
    }
  }
  // Fallback: try /{business_id}/instagram_business_accounts
  if (businessId) {
    const u2 = new URL(`${GRAPH}/${businessId}/instagram_business_accounts`);
    u2.searchParams.set("access_token", userToken);
    u2.searchParams.set("fields", "id,username");
    const r2 = await fetch(u2.toString());
    const j2 = await r2.json();
    if (r2.ok && Array.isArray(j2.data) && j2.data.length > 0) {
      console.log(`[meta-publish-post] Discovered IG user id ${j2.data[0].id} via business edge`);
      return j2.data[0].id;
    }
  }
  throw new Error("could not discover IG business account id from /me/accounts or business edge");
}

async function discoverFbPage(userToken: string): Promise<{ id: string; access_token: string }> {
  const url = new URL(`${GRAPH}/me/accounts`);
  url.searchParams.set("access_token", userToken);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("limit", "100");
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`/me/accounts (fb pages) failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`);
  }
  const pages = (data.data ?? []) as Array<{ id: string; name?: string; access_token?: string }>;
  if (pages.length === 0) throw new Error("no FB pages returned from /me/accounts");
  // Prefer a page named like "Tidy" if there are multiple
  const tidy = pages.find((p) => (p.name ?? "").toLowerCase().includes("tidy"));
  const chosen = tidy ?? pages[0];
  if (!chosen.access_token) throw new Error(`page ${chosen.id} has no access_token (missing pages_manage_posts scope?)`);
  console.log(`[meta-publish-post] Discovered FB page "${chosen.name}" (id ${chosen.id})`);
  return { id: chosen.id, access_token: chosen.access_token };
}

async function ensureCredentials(
  sb: ReturnType<typeof createClient>,
): Promise<{
  user_token: string;
  ig_user_id: string | null;
  fb_page_id: string | null;
  fb_page_token: string | null;
  ig_error: string | null;
  fb_error: string | null;
}> {
  const userToken = await vaultGet(sb, "meta_user_access_token");
  if (!userToken) throw new Error("vault: meta_user_access_token missing — run /meta-oauth-callback first");
  const businessId = await vaultGet(sb, "meta_business_id");

  let igUserId = await vaultGet(sb, "meta_ig_user_id");
  let igError: string | null = null;
  if (!igUserId) {
    try {
      igUserId = await discoverIgUserId(userToken, businessId);
      await vaultSet(sb, "meta_ig_user_id", igUserId);
    } catch (e) {
      igError = `IG discovery failed: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`[meta-publish-post] ${igError}`);
    }
  }
  let fbPageId = await vaultGet(sb, "meta_fb_page_id");
  let fbPageToken = await vaultGet(sb, "meta_fb_page_access_token");
  let fbError: string | null = null;
  if (!fbPageId || !fbPageToken) {
    try {
      const page = await discoverFbPage(userToken);
      fbPageId = page.id;
      fbPageToken = page.access_token;
      await vaultSet(sb, "meta_fb_page_id", fbPageId);
      await vaultSet(sb, "meta_fb_page_access_token", fbPageToken);
    } catch (e) {
      fbError = `FB discovery failed: ${e instanceof Error ? e.message : String(e)} — token likely missing pages_show_list/pages_manage_posts scopes; reconnect Meta or paste meta_fb_page_id + meta_fb_page_access_token via vault.`;
      console.warn(`[meta-publish-post] ${fbError}`);
    }
  }
  return {
    user_token: userToken,
    ig_user_id: igUserId,
    fb_page_id: fbPageId,
    fb_page_token: fbPageToken,
    ig_error: igError,
    fb_error: fbError,
  };
}

// ---------- IG publish ----------

async function publishInstagram(
  igUserId: string,
  userToken: string,
  imageUrl: string,
  caption: string,
): Promise<string> {
  // Step 1: create media container
  const containerUrl = new URL(`${GRAPH}/${igUserId}/media`);
  const cBody = new URLSearchParams({
    image_url: imageUrl,
    caption,
    access_token: userToken,
  });
  const cRes = await fetch(containerUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: cBody.toString(),
  });
  const cJson = await cRes.json();
  if (!cRes.ok || !cJson.id) {
    throw new Error(`IG container create failed (${cRes.status}): ${JSON.stringify(cJson).slice(0, 500)}`);
  }
  const creationId = cJson.id as string;

  // Step 2: wait for container to finish processing (Meta race fix)
  await waitForIgContainer(creationId, userToken);

  // Step 3: publish (with one retry on transient "not ready")
  const pubUrl = new URL(`${GRAPH}/${igUserId}/media_publish`);
  const doPublish = async () => {
    const r = await fetch(pubUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ creation_id: creationId, access_token: userToken }).toString(),
    });
    return { res: r, json: await r.json() };
  };
  let { res: pRes, json: pJson } = await doPublish();
  if (!pRes.ok && JSON.stringify(pJson).includes("2207027")) {
    await new Promise((r) => setTimeout(r, 5000));
    ({ res: pRes, json: pJson } = await doPublish());
  }
  if (!pRes.ok || !pJson.id) {
    throw new Error(`IG media_publish failed (${pRes.status}): ${JSON.stringify(pJson).slice(0, 500)}`);
  }
  return pJson.id as string;
}

async function waitForIgContainer(creationId: string, token: string, maxMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const r = await fetch(
      `${GRAPH}/${creationId}?fields=status_code&access_token=${encodeURIComponent(token)}`,
    );
    const j = await r.json().catch(() => ({}));
    if (j?.status_code === "FINISHED") return;
    if (j?.status_code === "ERROR") throw new Error(`IG container processing ERROR: ${JSON.stringify(j)}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function publishInstagramCarousel(
  igUserId: string,
  userToken: string,
  imageUrls: string[],
  caption: string,
): Promise<string> {
  // Step 1: create child containers (is_carousel_item=true)
  const childIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const u = new URL(`${GRAPH}/${igUserId}/media`);
    const b = new URLSearchParams({
      image_url: imageUrl,
      is_carousel_item: "true",
      access_token: userToken,
    });
    const r = await fetch(u.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: b.toString(),
    });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(`IG carousel child failed (${r.status}): ${JSON.stringify(j).slice(0, 400)}`);
    childIds.push(j.id as string);
  }
  // Step 2: create carousel parent
  const parentUrl = new URL(`${GRAPH}/${igUserId}/media`);
  const pBody = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: userToken,
  });
  const pRes = await fetch(parentUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: pBody.toString(),
  });
  const pJson = await pRes.json();
  if (!pRes.ok || !pJson.id) throw new Error(`IG carousel parent failed (${pRes.status}): ${JSON.stringify(pJson).slice(0, 400)}`);
  const creationId = pJson.id as string;
  // Step 3: publish
  const pubUrl = new URL(`${GRAPH}/${igUserId}/media_publish`);
  const pub = await fetch(pubUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ creation_id: creationId, access_token: userToken }).toString(),
  });
  const pubJson = await pub.json();
  if (!pub.ok || !pubJson.id) throw new Error(`IG carousel publish failed (${pub.status}): ${JSON.stringify(pubJson).slice(0, 400)}`);
  return pubJson.id as string;
}

// ---------- FB publish ----------

async function publishFacebook(
  pageId: string,
  pageToken: string,
  imageUrl: string,
  message: string,
): Promise<string> {
  const url = new URL(`${GRAPH}/${pageId}/photos`);
  const body = new URLSearchParams({
    url: imageUrl,
    message,
    published: "true",
    access_token: pageToken,
  });
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  if (!res.ok || !(data.post_id ?? data.id)) {
    throw new Error(`FB /photos failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`);
  }
  return (data.post_id ?? data.id) as string;
}

async function publishFacebookMultiPhoto(
  pageId: string,
  pageToken: string,
  imageUrls: string[],
  message: string,
): Promise<string> {
  // Step 1: upload each photo unpublished, collect media_fbid
  const mediaIds: string[] = [];
  for (const imageUrl of imageUrls) {
    const u = new URL(`${GRAPH}/${pageId}/photos`);
    const b = new URLSearchParams({
      url: imageUrl,
      published: "false",
      access_token: pageToken,
    });
    const r = await fetch(u.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: b.toString(),
    });
    const j = await r.json();
    if (!r.ok || !j.id) throw new Error(`FB unpublished photo failed (${r.status}): ${JSON.stringify(j).slice(0, 400)}`);
    mediaIds.push(j.id as string);
  }
  // Step 2: publish feed post with attached_media
  const attached = mediaIds.map((id) => ({ media_fbid: id }));
  const feedUrl = new URL(`${GRAPH}/${pageId}/feed`);
  const fBody = new URLSearchParams({
    message,
    attached_media: JSON.stringify(attached),
    access_token: pageToken,
  });
  const fRes = await fetch(feedUrl.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: fBody.toString(),
  });
  const fJson = await fRes.json();
  if (!fRes.ok || !fJson.id) throw new Error(`FB /feed multi failed (${fRes.status}): ${JSON.stringify(fJson).slice(0, 400)}`);
  return fJson.id as string;
}

// ---------- handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: { post_id?: string } = {};
  try {
    body = await req.json();
  } catch (_e) {
    // empty body OK
  }
  const postId = body?.post_id;
  if (!postId || typeof postId !== "string") {
    return json({ error: "post_id required (uuid string)" }, 400);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Lock row → 'posting'. Only proceed if it's currently in a postable state.
  const { data: post, error: loadErr } = await sb
    .from("social_posts")
    .select("id, image_path, image_paths, caption, status, day_number")
    .eq("id", postId)
    .maybeSingle();
  if (loadErr) return json({ error: `load failed: ${loadErr.message}` }, 500);
  if (!post) return json({ error: "post not found" }, 404);
  if (!["scheduled", "ready", "failed"].includes(post.status)) {
    return json({ error: `post not in postable state (status=${post.status})`, post_id: postId }, 409);
  }

  const { error: lockErr } = await sb
    .from("social_posts")
    .update({ status: "posting", error_message: null })
    .eq("id", postId)
    .in("status", ["scheduled", "ready", "failed"]);
  if (lockErr) return json({ error: `lock failed: ${lockErr.message}` }, 500);

  try {
    const creds = await ensureCredentials(sb);
    const imageUrls = resolveImageUrls(post);
    const isCarousel = imageUrls.length > 1;
    console.log(`[meta-publish-post] day=${post.day_number} carousel=${isCarousel} count=${imageUrls.length}`);

    let igPostId: string | null = null;
    let fbPostId: string | null = null;
    const errors: string[] = [];

    try {
      if (!creds.ig_user_id) throw new Error(creds.ig_error ?? "no IG user id available");
      igPostId = isCarousel
        ? await publishInstagramCarousel(creds.ig_user_id, creds.user_token, imageUrls, post.caption)
        : await publishInstagram(creds.ig_user_id, creds.user_token, imageUrls[0], post.caption);
      console.log(`[meta-publish-post] IG ok day=${post.day_number} id=${igPostId}`);
    } catch (e) {
      errors.push(`IG: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      if (!creds.fb_page_id || !creds.fb_page_token) throw new Error(creds.fb_error ?? "no FB page credentials available");
      fbPostId = isCarousel
        ? await publishFacebookMultiPhoto(creds.fb_page_id, creds.fb_page_token, imageUrls, post.caption)
        : await publishFacebook(creds.fb_page_id, creds.fb_page_token, imageUrls[0], post.caption);
      console.log(`[meta-publish-post] FB ok day=${post.day_number} id=${fbPostId}`);
    } catch (e) {
      errors.push(`FB: ${e instanceof Error ? e.message : String(e)}`);
    }

    // If at least one platform succeeded, mark posted; else failed.
    if (igPostId || fbPostId) {
      const { error: updErr } = await sb
        .from("social_posts")
        .update({
          status: errors.length === 0 ? "posted" : "posted",
          ig_post_id: igPostId,
          fb_post_id: fbPostId,
          posted_at: new Date().toISOString(),
          error_message: errors.length > 0 ? `partial: ${errors.join(" | ")}` : null,
        })
        .eq("id", postId);
      if (updErr) console.error(`[meta-publish-post] post-update failed: ${updErr.message}`);
      return json({
        ok: true,
        post_id: postId,
        ig_post_id: igPostId,
        fb_post_id: fbPostId,
        partial_errors: errors,
      });
    } else {
      const msg = errors.join(" | ");
      await sb
        .from("social_posts")
        .update({ status: "failed", error_message: msg.slice(0, 2000) })
        .eq("id", postId);
      return json({ ok: false, post_id: postId, error: msg }, 502);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[meta-publish-post] fatal: ${msg}`);
    await sb
      .from("social_posts")
      .update({ status: "failed", error_message: msg.slice(0, 2000) })
      .eq("id", postId);
    return json({ ok: false, post_id: postId, error: msg }, 500);
  }
});
