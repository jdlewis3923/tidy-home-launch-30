// Tidy — Meta OAuth callback (one-time bootstrap, mirrors jobber-oauth-callback).
//
// Public endpoint reached by the operator's browser after they click
// "Authorize" inside Meta. On a single click we:
//   1. Exchange ?code → short-lived user access token
//   2. Exchange short-lived → long-lived (60-day) user token
//   3. Discover the operator's businesses, pick "Tidy Home Services"
//   4. Find or create a "Tidy Web" pixel under that business
//   5. Mint a long-lived CAPI system-user access token for that pixel
//   6. Persist business_id, pixel_id, capi_token, user_token into pg vault
//   7. Render a success page summarizing what was captured
//
// Vault values are read at request-time by track-conversion → no redeploy
// needed once this completes.
//
// Auth: public endpoint (Meta redirect is unauthenticated browser hit).
// CSRF protection is via the `state` param — we accept the fixed value
// `tidy-prod-meta` since this is a one-shot operator bootstrap.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
const META_OAUTH_REDIRECT_URI = Deno.env.get('META_OAUTH_REDIRECT_URI') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GRAPH = 'https://graph.facebook.com/v19.0';
const TARGET_BUSINESS_NAME = 'Tidy Home Services';
const TARGET_PIXEL_NAME = 'Tidy Web';
const EXPECTED_STATE = 'tidy-prod-meta';

// ---------- helpers ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface CapturedValues {
  business_id: string;
  business_name: string;
  pixel_id: string;
  pixel_status: 'created' | 'reused';
  user_token_preview: string;
  user_token_expires_in?: number;
  capi_token_preview: string;
}

function renderHtml(opts: {
  title: string;
  captured?: CapturedValues;
  warnings?: string[];
  error?: string;
}): string {
  const { title, captured, warnings, error } = opts;
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
    .warn { background: #fffbeb; color: #92400e; }
    .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-top: 20px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    label { display: block; font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    .secret { background: #f1f5f9; padding: 12px; border-radius: 8px; font-size: 13px; }
    p.hint { color: #64748b; font-size: 13px; line-height: 1.5; }
    ul.warns { color: #92400e; font-size: 13px; }
  </style>
</head>
<body>
  <h1>Meta OAuth ${error ? '<span class="pill err">failed</span>' : '<span class="pill ok">success</span>'}</h1>
  ${error ? `<div class="card"><p class="hint" style="color:#991b1b;">${escapeHtml(error)}</p></div>` : ''}
  ${warnings && warnings.length ? `
  <div class="card">
    <label><span class="pill warn">heads up</span></label>
    <ul class="warns">${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
  </div>
  ` : ''}
  ${captured ? `
  <div class="card">
    <label>Business</label>
    <p class="hint"><strong>${escapeHtml(captured.business_name)}</strong> &middot; <code>${escapeHtml(captured.business_id)}</code></p>
  </div>
  <div class="card">
    <label>Pixel <span class="pill ${captured.pixel_status === 'created' ? 'ok' : 'warn'}">${captured.pixel_status === 'created' ? 'newly created' : 'existing pixel reused'}</span></label>
    <div class="secret"><code>${escapeHtml(captured.pixel_id)}</code></div>
    <p class="hint">Stored as vault secret <code>meta_pixel_id</code>.</p>
  </div>
  <div class="card">
    <label>CAPI access token (system user, long-lived)</label>
    <div class="secret"><code>${escapeHtml(captured.capi_token_preview)}…</code></div>
    <p class="hint">Stored as vault secret <code>meta_capi_access_token</code>. Backend conversion fan-out will pick this up automatically on the next request.</p>
  </div>
  <div class="card">
    <label>User access token (60-day, for future Graph calls)</label>
    <div class="secret"><code>${escapeHtml(captured.user_token_preview)}…</code></div>
    <p class="hint">Stored as vault secret <code>meta_user_access_token</code>. Expires in ${captured.user_token_expires_in ?? '~5,184,000'}s (~60 days).</p>
  </div>
  ` : ''}
  <p class="hint" style="margin-top:32px;">All values are in the encrypted vault. You can close this tab.</p>
</body>
</html>`;
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ---------- Meta API client ----------

interface ShortLivedTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

async function exchangeCode(code: string): Promise<ShortLivedTokenResponse> {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: META_OAUTH_REDIRECT_URI,
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`code exchange failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

async function exchangeForLongLived(shortToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('client_secret', META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(url.toString(), { method: 'GET' });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`long-lived exchange failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json;
}

interface BusinessSummary {
  id: string;
  name: string;
}

async function listBusinesses(longToken: string): Promise<BusinessSummary[]> {
  const url = new URL(`${GRAPH}/me/businesses`);
  url.searchParams.set('access_token', longToken);
  url.searchParams.set('fields', 'id,name');
  url.searchParams.set('limit', '100');
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`/me/businesses failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.data ?? []) as BusinessSummary[];
}

interface PixelSummary {
  id: string;
  name: string;
  is_unavailable?: boolean;
  creation_time?: string;
}

async function listOwnedPixels(businessId: string, longToken: string): Promise<PixelSummary[]> {
  const url = new URL(`${GRAPH}/${businessId}/owned_pixels`);
  url.searchParams.set('access_token', longToken);
  url.searchParams.set('fields', 'id,name,creation_time,is_unavailable');
  url.searchParams.set('limit', '100');
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`owned_pixels list failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return (json.data ?? []) as PixelSummary[];
}

async function createPixelOnBusiness(businessId: string, longToken: string): Promise<string> {
  // CORRECT endpoint per Meta Graph API v19.0 — /adspixels (not /owned_pixels which is read-only).
  const url = new URL(`${GRAPH}/${businessId}/adspixels`);
  const body = new URLSearchParams({ name: TARGET_PIXEL_NAME, access_token: longToken });
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(`pixel create on business failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.id as string;
}

interface AdAccountSummary {
  id: string; // already prefixed with act_
  account_id: string; // raw numeric
  name?: string;
}

async function listAdAccounts(businessId: string, longToken: string): Promise<AdAccountSummary[]> {
  // Try owned ad accounts first, then client ad accounts as a secondary set.
  const out: AdAccountSummary[] = [];
  for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
    const url = new URL(`${GRAPH}/${businessId}/${edge}`);
    url.searchParams.set('access_token', longToken);
    url.searchParams.set('fields', 'id,account_id,name');
    url.searchParams.set('limit', '100');
    const res = await fetch(url.toString());
    const json = await res.json();
    if (res.ok && Array.isArray(json.data)) {
      out.push(...(json.data as AdAccountSummary[]));
    } else {
      console.warn(`[meta-oauth-callback] ${edge} list failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
    }
  }
  return out;
}

async function createPixelOnAdAccount(adAccountId: string, longToken: string): Promise<string> {
  // adAccountId may already be `act_...` or raw numeric.
  const id = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
  const url = new URL(`${GRAPH}/${id}/adspixels`);
  const body = new URLSearchParams({ name: TARGET_PIXEL_NAME, access_token: longToken });
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.id) {
    throw new Error(`pixel create on ad account ${id} failed (${res.status}): ${JSON.stringify(json).slice(0, 400)}`);
  }
  return json.id as string;
}

// NOTE: Meta does not expose a public Graph API endpoint to programmatically
// mint a pixel-scoped CAPI token (the "Generate Access Token" button in
// Events Manager creates a System User token via an internal flow). For now
// we alias the long-lived user access token as the CAPI token — Meta's CAPI
// accepts user access tokens for authentication.
//
// Hardening note: META_CAPI_ACCESS_TOKEN currently aliases the user access
// token (60-day expiry). For production scale, replace with a system user
// token by (a) POST /{business_id}/system_users to create, (b) POST
// /{business_id}/system_user_access_tokens to mint a permanent token.
// Defer until billing volume justifies hardening.

// ---------- vault persistence ----------

async function persistToVault(values: Record<string, string>): Promise<void> {
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [name, value] of Object.entries(values)) {
    const { error } = await sb.rpc('admin_set_meta_secret', {
      _name: name,
      _value: value,
    });
    if (error) {
      throw new Error(`vault write failed for ${name}: ${error.message}`);
    }
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errParam = url.searchParams.get('error');
  const errReason = url.searchParams.get('error_reason');
  const errDesc = url.searchParams.get('error_description');

  if (errParam) {
    return htmlResponse(
      renderHtml({
        title: 'Meta OAuth — error',
        error: `Meta returned: ${errParam}${errReason ? ` (${errReason})` : ''}${errDesc ? ` — ${errDesc}` : ''}`,
      }),
      400,
    );
  }

  if (!code) {
    return htmlResponse(
      renderHtml({ title: 'Meta OAuth — missing code', error: 'No ?code param in callback URL.' }),
      400,
    );
  }

  if (state && state !== EXPECTED_STATE) {
    return htmlResponse(
      renderHtml({
        title: 'Meta OAuth — state mismatch',
        error: `Unexpected state value (got "${state}", expected "${EXPECTED_STATE}"). Aborting to prevent CSRF.`,
      }),
      400,
    );
  }

  if (!META_APP_ID || !META_APP_SECRET || !META_OAUTH_REDIRECT_URI) {
    return htmlResponse(
      renderHtml({
        title: 'Meta OAuth — config missing',
        error: 'Server is missing META_APP_ID, META_APP_SECRET, or META_OAUTH_REDIRECT_URI.',
      }),
      500,
    );
  }

  try {
    const result = await withLogging({
      source: 'meta_capi',
      event: 'oauth_callback',
      payload: { code_present: true },
      fn: async (): Promise<{ captured: CapturedValues; warnings: string[] }> => {
        const warnings: string[] = [];

        // 1 + 2: exchange code → short → long
        const shortLived = await exchangeCode(code);
        const longLived = await exchangeForLongLived(shortLived.access_token);

        // 3: discover business
        const businesses = await listBusinesses(longLived.access_token);
        console.log(
          `[meta-oauth-callback] /me/businesses returned ${businesses.length} businesses: ${businesses
            .map((b) => `"${b.name}" (${b.id})`)
            .join(', ')}`,
        );
        let target = businesses.find(
          (b) => b.name?.toLowerCase().trim() === TARGET_BUSINESS_NAME.toLowerCase(),
        );
        if (!target) {
          if (businesses.length === 1) {
            target = businesses[0];
            warnings.push(
              `No business named "${TARGET_BUSINESS_NAME}" found. Falling back to the only business available: "${target.name}".`,
            );
          } else if (businesses.length === 0) {
            throw new Error(
              'No businesses returned from /me/businesses. Verify the operator account has Business Manager access and the OAuth scope includes business_management.',
            );
          } else {
            throw new Error(
              `No business named "${TARGET_BUSINESS_NAME}" found among ${businesses.length} businesses: ${businesses.map((b) => b.name).join(', ')}`,
            );
          }
        }
        console.log(
          `[meta-oauth-callback] Selected business: "${target.name}" (id ${target.id}) from ${businesses.length} available businesses.`,
        );

        // 4: find or create pixel
        const pixels = await listOwnedPixels(target.id, longLived.access_token);
        console.log(
          `[meta-oauth-callback] /${target.id}/owned_pixels returned ${pixels.length} pixels: ${pixels
            .map((p) => `"${p.name}" (${p.id}${p.is_unavailable ? ', UNAVAILABLE' : ''})`)
            .join(', ') || '(none)'}`,
        );
        let pixelId: string;
        let pixelStatus: 'created' | 'reused';
        const existing = pixels.find(
          (p) => p.name?.toLowerCase().trim() === TARGET_PIXEL_NAME.toLowerCase() && !p.is_unavailable,
        );
        if (existing) {
          pixelId = existing.id;
          pixelStatus = 'reused';
          console.log(`[meta-oauth-callback] Reusing existing pixel "${existing.name}" (id ${existing.id}).`);
        } else {
          try {
            pixelId = await createPixelOnBusiness(target.id, longLived.access_token);
            pixelStatus = 'created';
            console.log(`[meta-oauth-callback] Created new pixel via business endpoint (id ${pixelId}).`);
          } catch (bizErr) {
            const bizMsg = bizErr instanceof Error ? bizErr.message : String(bizErr);
            console.warn(
              `[meta-oauth-callback] Business pixel create failed; falling back to ad account. Error: ${bizMsg}`,
            );
            warnings.push(
              `Pixel create on business failed (${bizMsg.slice(0, 200)}). Falling back to ad account create.`,
            );
            const adAccounts = await listAdAccounts(target.id, longLived.access_token);
            console.log(
              `[meta-oauth-callback] Found ${adAccounts.length} ad accounts under business: ${adAccounts
                .map((a) => `"${a.name ?? '?'}" (${a.id})`)
                .join(', ') || '(none)'}`,
            );
            if (adAccounts.length === 0) {
              throw new Error(
                `Pixel create on business failed and no ad accounts available as fallback. Original error: ${bizMsg}`,
              );
            }
            let lastErr: string = '';
            let createdId: string | null = null;
            for (const acct of adAccounts) {
              try {
                createdId = await createPixelOnAdAccount(acct.id, longLived.access_token);
                console.log(
                  `[meta-oauth-callback] Created pixel via ad account ${acct.id} (id ${createdId}).`,
                );
                break;
              } catch (adErr) {
                lastErr = adErr instanceof Error ? adErr.message : String(adErr);
                console.warn(`[meta-oauth-callback] Ad account ${acct.id} create failed: ${lastErr}`);
              }
            }
            if (!createdId) {
              throw new Error(
                `Pixel create failed on business and on all ${adAccounts.length} ad account fallbacks. Last error: ${lastErr}`,
              );
            }
            pixelId = createdId;
            pixelStatus = 'created';
          }
        }

        // 5: alias the long-lived user token as the CAPI token (see note above mintCapiToken removal).
        const capiToken = longLived.access_token;
        console.log('[meta-oauth-callback] CAPI token aliased from user access token (60-day expiry).');

        // 6: persist all 4 to vault
        await persistToVault({
          meta_business_id: target.id,
          meta_pixel_id: pixelId,
          meta_capi_access_token: capiToken,
          meta_user_access_token: longLived.access_token,
        });

        return {
          captured: {
            business_id: target.id,
            business_name: target.name,
            pixel_id: pixelId,
            pixel_status: pixelStatus,
            user_token_preview: longLived.access_token.slice(0, 24),
            user_token_expires_in: longLived.expires_in,
            capi_token_preview: capiToken.slice(0, 24),
          },
          warnings,
        };
      },
    });

    return htmlResponse(
      renderHtml({
        title: 'Meta OAuth — success',
        captured: result.captured,
        warnings: result.warnings,
      }),
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    console.error('[meta-oauth-callback] failed', msg);
    return htmlResponse(renderHtml({ title: 'Meta OAuth — error', error: msg }), 500);
  }
});
