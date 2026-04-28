// Tidy — Mint single-use magic-link token for /add/{token}.
//
// Service-role only. Used by send-addon-attach-sms.
//
// Returns: { ok, token, url } where url is the full https tidy.app/add/<token>.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  user_id: z.string().uuid(),
  base_url: z.string().url().optional(),
});

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === SUPABASE_SERVICE_ROLE_KEY;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 32);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: 'validation_failed' }, 400);
  const { user_id, base_url } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Look up email
  const { data: userData, error: userErr } = await admin.auth.admin.getUserById(user_id);
  if (userErr || !userData?.user?.email) {
    return jsonResponse({ ok: false, error: 'user_not_found' }, 404);
  }
  const email = userData.user.email;

  const token = randomToken();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error: insErr } = await admin.from('addon_attach_tokens').insert({
    token, user_id, email, expires_at: expires,
  });
  if (insErr) {
    return jsonResponse({ ok: false, error: 'token_insert_failed', detail: insErr.message }, 500);
  }

  const root = base_url ?? 'https://jointidy.co';
  return jsonResponse({ ok: true, token, url: `${root}/add/${token}`, expires_at: expires });
});
