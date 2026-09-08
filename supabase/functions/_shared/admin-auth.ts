// Tidy — shared service-role / admin authorization.
//
// NEVER decode a JWT and trust its claims. This repo is public and the anon
// publishable key is committed, so "has a JWT" proves nothing. A forged
// alg:none token with {"role":"service_role"} must be rejected.
//
// Two accepted proofs of authority:
//   1. Constant-time match against the literal SUPABASE_SERVICE_ROLE_KEY.
//   2. admin.auth.getUser(token) — a cryptographically verified user session —
//      followed by a public.user_roles lookup for role = 'admin'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type AuthResult =
  | { ok: true; kind: 'service_role'; userId: null }
  | { ok: true; kind: 'admin'; userId: string }
  | { ok: false; status: 401 | 403; error: string };

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Bearer token only — the `apikey` header is never validated by the gateway. */
export function bearerToken(req: Request): string {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export async function requireServiceOrAdmin(req: Request): Promise<AuthResult> {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  if (serviceKey && safeEquals(token, serviceKey)) {
    return { ok: true, kind: 'service_role', userId: null };
  }

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Signature-verified. A hand-made token fails here.
    const { data, error } = await admin.auth.getUser(token);
    const userId = data?.user?.id;
    if (error || !userId) return { ok: false, status: 401, error: 'unauthorized' };

    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!roleRow) return { ok: false, status: 403, error: 'forbidden' };
    return { ok: true, kind: 'admin', userId };
  } catch {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
}
