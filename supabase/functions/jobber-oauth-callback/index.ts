import '../_shared/http.ts';
// jobber-oauth-callback — Jobber redirects here after Justin approves access.
// Verifies the one-time state, exchanges the code, stores the refresh token in
// Vault, then sends the browser back to /admin.
import { admin, exchangeCode, log } from '../_shared/jobber.ts';

const SITE = 'https://jointidy.co/admin';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const db = admin();
  const back = (q: string) => Response.redirect(`${SITE}?jobber=${q}`, 302);
  if (!code || !state) return back('missing_code');
  const { data } = await db.from('app_settings').select('value').eq('key', 'jobber_oauth_state').maybeSingle();
  const saved = (data?.value as any) ?? {};
  if (saved.state !== state || Date.now() - Date.parse(saved.at ?? 0) > 30 * 60_000) {
    await log(db, 'oauth_callback', 'error', 'state mismatch or expired');
    return back('bad_state');
  }
  try {
    await exchangeCode(db, code, `${Deno.env.get('SUPABASE_URL')}/functions/v1/jobber-oauth-callback`);
    await db.from('app_settings').delete().eq('key', 'jobber_oauth_state');
    await log(db, 'oauth_callback', 'success');
    return back('connected');
  } catch (e) {
    await log(db, 'oauth_callback', 'error', (e as Error).message);
    return back('failed');
  }
});
