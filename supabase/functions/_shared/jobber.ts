import './http.ts';
// Tidy — Jobber GraphQL client (Jobber is the schedule of record, Nov 2026).
//
// Tokens: the rotating refresh token lives in Vault ('jobber_refresh_token'),
// falling back to the JOBBER_REFRESH_TOKEN secret. Every refresh stores the
// newly rotated token back in Vault so the chain never breaks.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export const JOBBER_GQL = 'https://api.getjobber.com/api/graphql';
export const JOBBER_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';
export const JOBBER_AUTHORIZE_URL = 'https://api.getjobber.com/api/oauth/authorize';
export const JOBBER_VERSION = Deno.env.get('JOBBER_GRAPHQL_VERSION') ?? '2025-04-16';

export function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let cachedAccess: { token: string; exp: number } | null = null;

export async function saveRefreshToken(db: SupabaseClient, token: string) {
  const { error } = await db.rpc('admin_set_jobber_refresh_token', { _token: token });
  if (error) throw new Error(`could not store Jobber refresh token: ${error.message}`);
}

export async function accessToken(db: SupabaseClient): Promise<string> {
  if (cachedAccess && cachedAccess.exp > Date.now() + 60_000) return cachedAccess.token;
  const { data: vaultTok } = await db.rpc('admin_get_jobber_refresh_token');
  const refresh = (vaultTok as string | null) || Deno.env.get('JOBBER_REFRESH_TOKEN');
  if (!refresh) throw new Error('jobber_not_connected: no refresh token — click Reconnect Jobber on /admin');
  const res = await fetch(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('JOBBER_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('JOBBER_CLIENT_SECRET') ?? '',
      grant_type: 'refresh_token',
      refresh_token: refresh,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`jobber_not_connected: token refresh failed [${res.status}] ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  if (j.refresh_token && j.refresh_token !== refresh) await saveRefreshToken(db, j.refresh_token);
  cachedAccess = { token: j.access_token, exp: Date.now() + 50 * 60_000 };
  return j.access_token;
}

export async function exchangeCode(db: SupabaseClient, code: string, redirectUri: string) {
  const res = await fetch(JOBBER_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('JOBBER_CLIENT_ID') ?? '',
      client_secret: Deno.env.get('JOBBER_CLIENT_SECRET') ?? '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`code exchange failed [${res.status}] ${text.slice(0, 300)}`);
  const j = JSON.parse(text);
  await saveRefreshToken(db, j.refresh_token);
  cachedAccess = { token: j.access_token, exp: Date.now() + 50 * 60_000 };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GraphQL call with 3 tries + backoff. Throws on transport, GraphQL or userErrors. */
export async function gql<T = any>(db: SupabaseClient, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let last: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const token = await accessToken(db);
      const res = await fetch(JOBBER_GQL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-JOBBER-GRAPHQL-VERSION': JOBBER_VERSION,
        },
        body: JSON.stringify({ query, variables }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`jobber [${res.status}] ${text.slice(0, 500)}`);
      const j = JSON.parse(text);
      if (j.errors?.length) throw new Error(`jobber graphql: ${j.errors.map((e: any) => e.message).join('; ')}`);
      const ue = findUserErrors(j.data);
      if (ue.length) throw new Error(`jobber userErrors: ${ue.join('; ')}`);
      return j.data as T;
    } catch (e) {
      last = e as Error;
      if (String(last.message).startsWith('jobber_not_connected')) break;
      if (attempt < 2) await sleep(1000 * 4 ** attempt);
    }
  }
  throw last ?? new Error('jobber call failed');
}

function findUserErrors(d: unknown): string[] {
  const out: string[] = [];
  if (d && typeof d === 'object') {
    for (const v of Object.values(d as Record<string, any>)) {
      if (v && Array.isArray(v.userErrors)) for (const e of v.userErrors) out.push(`${(e.path ?? []).join('.')}: ${e.message}`);
    }
  }
  return out;
}

export async function log(db: SupabaseClient, event: string, status: 'success' | 'error' | 'warning', message?: string, payload?: unknown) {
  try {
    await db.from('integration_logs').insert({ source: 'jobber', event, status, error_message: message ? message.slice(0, 2000) : null, detail: payload ?? null } as any);
  } catch { /* never throw */ }
}
