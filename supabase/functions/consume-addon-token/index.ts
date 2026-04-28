// Tidy — Validates a /add/{token} token and returns a Supabase magic-link URL
// the browser can navigate to in order to log the customer in.
//
// Uses supabase.auth.admin.generateLink({ type: 'magiclink' }) to mint a
// one-time auth URL bound to the customer's email. Marks token as used.
//
// Anonymous-callable (no JWT required) — the security boundary is the
// random 32-char token + single-use + 24h expiry.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  token: z.string().min(8).max(64),
  redirect_to: z.string().url().optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: 'validation_failed' }, 400);
  const { token, redirect_to } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: row, error } = await admin
    .from('addon_attach_tokens')
    .select('token, user_id, email, expires_at, used_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !row) {
    return jsonResponse({ ok: false, error: 'invalid_token' }, 404);
  }
  if (row.used_at) {
    return jsonResponse({ ok: false, error: 'token_already_used' }, 410);
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return jsonResponse({ ok: false, error: 'token_expired' }, 410);
  }

  const finalRedirect = redirect_to ?? 'https://jointidy.co/dashboard#add-to-next-visit';

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: row.email,
    options: { redirectTo: finalRedirect },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    return jsonResponse({ ok: false, error: 'magic_link_failed', detail: linkErr?.message }, 500);
  }

  await admin
    .from('addon_attach_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  return jsonResponse({
    ok: true,
    action_link: linkData.properties.action_link,
    user_id: row.user_id,
  });
});
