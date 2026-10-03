// Customer visit photo proof. The bucket stays private; this endpoint verifies
// ownership before returning short-lived signed URLs for one completed visit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { missingEnvError, readEnv } from "../_shared/handlerEnv.ts";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const BodySchema = z.object({ visit_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const env = readEnv(REQUIRED_ENV);
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) }, 500);

  const authHeader = req.headers.get("Authorization") ?? "";
  const auth = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await auth.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return jsonResponse({ ok: false, error: "unauthorized" }, 401);

  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: "invalid_body" }, 400);

  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: visit } = await admin
    .from("visits")
    .select("id, user_id, status, service, service_type, visit_date, completed_at, crew_name")
    .eq("id", parsed.data.visit_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!visit) return jsonResponse({ ok: false, error: "visit_not_found" }, 404);
  if (visit.status !== "complete") return jsonResponse({ ok: false, error: "visit_not_complete" }, 409);

  const { data: rows, error } = await admin
    .from("visit_photos")
    .select("id, kind, storage_path, uploaded_at")
    .eq("visit_id", visit.id)
    .in("kind", ["before", "after"])
    .order("uploaded_at", { ascending: true });
  if (error) return jsonResponse({ ok: false, error: "photo_read_failed" }, 500);

  const photos = await Promise.all((rows ?? []).map(async (photo) => {
    const { data } = await admin.storage.from("visit-photos").createSignedUrl(photo.storage_path, 900);
    return { id: photo.id, kind: photo.kind, uploaded_at: photo.uploaded_at, url: data?.signedUrl ?? null };
  }));

  return jsonResponse({ ok: true, visit, photos: photos.filter((photo) => photo.url) });
});