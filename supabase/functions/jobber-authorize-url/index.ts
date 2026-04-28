// Tidy — Returns the Jobber OAuth authorization URL for the admin one-tap re-auth button.
// Admin-gated. Client opens the URL in a new tab; Jobber redirects back to
// jobber-oauth-callback which auto-persists the new refresh token to vault.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const JOBBER_AUTHORIZE_URL = 'https://api.getjobber.com/api/oauth/authorize';
const JOBBER_SCOPES = 'read_clients write_clients read_jobs write_jobs read_invoices write_invoices read_users';

async function isAdminCaller(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error } = await supabase.auth.getClaims(token);
    if (error || !claims?.claims?.sub) return false;
    const userId = claims.claims.sub as string;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!roleRow;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }
  if (!(await isAdminCaller(req))) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const clientId = Deno.env.get('JOBBER_CLIENT_ID');
  if (!clientId) {
    return jsonResponse({ ok: false, error: 'JOBBER_CLIENT_ID not configured' }, 500);
  }

  const redirectUri = `${SUPABASE_URL}/functions/v1/jobber-oauth-callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: JOBBER_SCOPES,
    state: crypto.randomUUID(),
  });

  return jsonResponse({
    ok: true,
    authorize_url: `${JOBBER_AUTHORIZE_URL}?${params.toString()}`,
    redirect_uri: redirectUri,
  });
});
