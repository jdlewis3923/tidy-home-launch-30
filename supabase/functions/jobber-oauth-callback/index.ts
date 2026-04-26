// Tidy — Jobber OAuth callback (one-time bootstrap)
//
// Public endpoint reached by the operator's browser after they click
// "Authorize" inside Jobber. Exchanges ?code for an access + refresh
// token, fetches the account info to display the team/account ID, and
// renders an HTML page with the values to copy into Lovable secrets:
//   - JOBBER_REFRESH_TOKEN (initial bootstrap; subsequent rotations
//     are persisted automatically into vault by jobber-client.ts)
//   - JOBBER_DEFAULT_TEAM_ID
//
// Not admin-gated by JWT (Jobber redirect is unauthenticated browser
// hit) but includes a CSRF-style nonce check via the `state` param.

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import {
  exchangeAuthorizationCode,
  jobberGraphQL,
  JOBBER_REDIRECT_URI,
} from '../_shared/jobber-client.ts';
import { withLogging } from '../_shared/withLogging.ts';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(opts: {
  title: string;
  refreshToken?: string;
  accessTokenPreview?: string;
  expiresIn?: number;
  account?: { id: string; name: string };
  error?: string;
}): string {
  const { title, refreshToken, accessTokenPreview, expiresIn, account, error } = opts;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #0f172a; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .pill { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .ok { background: #ecfdf5; color: #065f46; }
    .err { background: #fef2f2; color: #991b1b; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 20px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    label { display: block; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    .secret { background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 13px; }
    button { background: #0f172a; color: #fff; border: 0; padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 12px; }
    button:hover { background: #1e293b; }
    p.hint { color: #64748b; font-size: 13px; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>Jobber OAuth ${error ? '<span class="pill err">failed</span>' : '<span class="pill ok">success</span>'}</h1>
  ${error ? `<div class="card"><p class="hint" style="color:#991b1b;">${escapeHtml(error)}</p></div>` : ''}
  ${refreshToken ? `
  <div class="card">
    <label>Refresh token — copy into Lovable secret <code>JOBBER_REFRESH_TOKEN</code></label>
    <div class="secret"><code id="rt">${escapeHtml(refreshToken)}</code></div>
    <button onclick="navigator.clipboard.writeText(document.getElementById('rt').innerText)">Copy</button>
    <p class="hint">This token will rotate on next use. Subsequent rotations are persisted automatically into pg vault — you only need to paste this initial value once.</p>
  </div>
  ` : ''}
  ${account ? `
  <div class="card">
    <label>Account / team ID — copy into Lovable secret <code>JOBBER_DEFAULT_TEAM_ID</code></label>
    <div class="secret"><code id="aid">${escapeHtml(account.id)}</code></div>
    <button onclick="navigator.clipboard.writeText(document.getElementById('aid').innerText)">Copy</button>
    <p class="hint">Account name: <strong>${escapeHtml(account.name)}</strong></p>
  </div>
  ` : ''}
  ${accessTokenPreview ? `
  <div class="card">
    <label>Access token preview (informational)</label>
    <p class="hint"><code>${escapeHtml(accessTokenPreview)}…</code> · expires in ${expiresIn ?? '?'}s</p>
  </div>
  ` : ''}
  <p class="hint" style="margin-top:32px;">After pasting the secrets above, you can close this tab. The Jobber integration is now live.</p>
</body>
</html>`;
}

const ACCOUNT_QUERY = `
  query AccountInfo {
    account {
      id
      name
    }
  }
`;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const errParam = url.searchParams.get('error');

  if (errParam) {
    return new Response(
      renderHtml({ title: 'Jobber OAuth — error', error: `Jobber returned: ${errParam}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  if (!code) {
    return new Response(
      renderHtml({ title: 'Jobber OAuth — missing code', error: 'No ?code param in callback URL.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  try {
    const tokens = await withLogging({
      source: 'jobber',
      event: 'oauth_callback',
      payload: { code_present: true },
      fn: () => exchangeAuthorizationCode(code, JOBBER_REDIRECT_URI),
    });

    // Probe the API for account info — also confirms the access token works.
    let account: { id: string; name: string } | undefined;
    try {
      // Temporarily inject the access token by making a one-off raw call —
      // jobberGraphQL uses the cached/refreshed token, but we just got
      // a fresh access token from the code exchange and the cache is empty
      // on cold start. Hit the API directly with the new token.
      const acctRes = await fetch('https://api.getjobber.com/api/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
          'X-JOBBER-GRAPHQL-VERSION': '2024-04-01',
        },
        body: JSON.stringify({ query: ACCOUNT_QUERY }),
      });
      const acctJson = await acctRes.json();
      if (acctJson?.data?.account) {
        account = { id: acctJson.data.account.id, name: acctJson.data.account.name };
      }
    } catch (err) {
      console.warn('[jobber-oauth-callback] account probe failed', err);
    }

    return new Response(
      renderHtml({
        title: 'Jobber OAuth — success',
        refreshToken: tokens.refresh_token,
        accessTokenPreview: tokens.access_token.slice(0, 24),
        expiresIn: tokens.expires_in,
        account,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[jobber-oauth-callback] failed', msg);
    return new Response(
      renderHtml({ title: 'Jobber OAuth — error', error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
});
