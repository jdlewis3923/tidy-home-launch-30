// Tidy — One-time setup helper for the welcome_signup DB trigger.
//
// The handle_welcome_signup trigger needs the SUPABASE_SERVICE_ROLE_KEY
// stored in pg vault under name 'service_role_key' so it can authorize
// its outbound pg_net call to send-zapier-event. Edge functions have
// access to SUPABASE_SERVICE_ROLE_KEY via env; we forward it server-side
// (admin-gated) into vault via admin_set_service_role_key RPC.
//
// Idempotent. Admin-gated. Safe to re-run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  // Verify admin via the caller's JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const token = auth.slice(7);
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claims?.claims?.sub) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  // Use the caller's JWT to call the admin RPC (RPC self-checks via has_role).
  const { error: rpcErr } = await userClient.rpc('admin_set_service_role_key', {
    _key: SUPABASE_SERVICE_ROLE_KEY,
  });

  if (rpcErr) {
    return jsonResponse({ ok: false, error: rpcErr.message }, 403);
  }

  return jsonResponse({ ok: true, configured: true }, 200);
});
