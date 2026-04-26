// Tidy — Shared Jobber GraphQL client + token-refresh helper.
//
// Jobber uses OAuth2 with rotating refresh tokens. Each refresh returns
// a NEW refresh_token; the old one is invalidated on next use. We persist
// the latest refresh token in vault.secrets under 'jobber_refresh_token'
// so all edge functions share a single source of truth and can heal from
// rotation without operator intervention.
//
// On cold start we read JOBBER_REFRESH_TOKEN env (operator-set initial
// token from the OAuth callback flow) as a fallback, then exchange it
// for an access token. Subsequent calls reuse the in-memory access token
// until it nears expiry.

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const JOBBER_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';
const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';
// Jobber API version pin — bump deliberately when upgrading.
const JOBBER_API_VERSION = '2024-04-01';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface TokenCache {
  access_token: string;
  expires_at: number; // epoch ms
}

let _serviceClient: SupabaseClient | null = null;
let _tokenCache: TokenCache | null = null;

function getServiceClient(): SupabaseClient {
  if (_serviceClient) return _serviceClient;
  _serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

/**
 * Pull the latest refresh token. Prefer vault (rotated value) and fall
 * back to env (initial bootstrap from the OAuth callback flow).
 */
async function getCurrentRefreshToken(): Promise<string> {
  const supabase = getServiceClient();
  try {
    const { data, error } = await supabase
      .schema('vault' as never)
      .from('decrypted_secrets' as never)
      .select('decrypted_secret' as never)
      .eq('name' as never, 'jobber_refresh_token' as never)
      .maybeSingle();
    if (!error && data && (data as { decrypted_secret?: string }).decrypted_secret) {
      return (data as { decrypted_secret: string }).decrypted_secret;
    }
  } catch (err) {
    console.warn('[jobber-client] vault read failed, falling back to env', err);
  }

  const envToken = Deno.env.get('JOBBER_REFRESH_TOKEN');
  if (!envToken) {
    throw new Error('No Jobber refresh token available (vault + env both empty)');
  }
  return envToken;
}

/**
 * Persist a freshly-rotated refresh token into vault. Best-effort —
 * if vault.create_secret/update_secret RPC isn't available we log and
 * continue; next cold start will re-bootstrap from env.
 */
export async function persistRefreshToken(refreshToken: string): Promise<void> {
  const supabase = getServiceClient();
  try {
    // Use raw SQL via PostgREST RPC pattern — vault has no PostgREST surface,
    // so we go through a SECURITY DEFINER function. We piggyback on the
    // existing admin_set_service_role_key pattern but for jobber.
    // If the function doesn't exist yet, fail soft.
    const { error } = await supabase.rpc('admin_set_jobber_refresh_token' as never, {
      _token: refreshToken,
    } as never);
    if (error) {
      console.warn('[jobber-client] persistRefreshToken RPC missing or failed', error.message);
    }
  } catch (err) {
    console.warn('[jobber-client] persistRefreshToken threw', err);
  }
}

/**
 * Exchange a refresh token for a fresh access token. Returns BOTH the
 * access token (for immediate use) and the new refresh token (which the
 * caller must persist back to vault).
 */
async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = Deno.env.get('JOBBER_CLIENT_ID');
  const clientSecret = Deno.env.get('JOBBER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET missing');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jobber token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
  };
}

/** Public: exchange an authorization code for the initial token pair. */
export async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const clientId = Deno.env.get('JOBBER_CLIENT_ID');
  const clientSecret = Deno.env.get('JOBBER_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('JOBBER_CLIENT_ID / JOBBER_CLIENT_SECRET missing');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jobber code exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return JSON.parse(text);
}

/** Get a usable access token, refreshing if cached one is missing/stale. */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expires_at - 60_000 > now) {
    return _tokenCache.access_token;
  }

  const refresh = await getCurrentRefreshToken();
  const fresh = await refreshAccessToken(refresh);

  _tokenCache = {
    access_token: fresh.access_token,
    expires_at: now + fresh.expires_in * 1000,
  };

  // Persist rotated refresh token (best-effort).
  if (fresh.refresh_token && fresh.refresh_token !== refresh) {
    await persistRefreshToken(fresh.refresh_token);
  }

  return fresh.access_token;
}

/** Run a Jobber GraphQL query/mutation. Throws on transport or GraphQL errors. */
export async function jobberGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const accessToken = await getAccessToken();

  const res = await fetch(JOBBER_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-JOBBER-GRAPHQL-VERSION': JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Jobber GraphQL HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const json = JSON.parse(text) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors && json.errors.length) {
    throw new Error(`Jobber GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) {
    throw new Error('Jobber GraphQL response missing data field');
  }
  return json.data;
}

/** Verify the HMAC-SHA256 signature on an inbound Jobber webhook. */
export async function verifyJobberWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  const secret = Deno.env.get('JOBBER_WEBHOOK_SECRET');
  if (!secret) {
    console.warn('[jobber-client] JOBBER_WEBHOOK_SECRET not set — refusing webhook');
    return false;
  }
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  // Jobber sends base64; support both.
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return signature === hex || signature === b64;
}

export const JOBBER_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/jobber-oauth-callback`;
export const JOBBER_API_VERSION_HEADER = JOBBER_API_VERSION;
