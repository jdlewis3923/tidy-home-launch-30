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
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      console.error('[jobber-authorize-url] getUser failed', userErr?.message);
      return false;
    }
    const userId = userData.user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow, error: roleErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (roleErr) {
      console.error('[jobber-authorize-url] role lookup failed', roleErr.message);
      return false;
    }
    if (!roleRow) {
      console.warn('[jobber-authorize-url] user not admin', userId);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[jobber-authorize-url] auth check threw', (e as Error).message);
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
