// Tidy — shared cron auth helper.
//
// pg_cron jobs must not embed any credential in cron.job.command, so they read
// the service credential from Vault at call time and send it as x-cron-key.
// This helper accepts a key that matches EITHER the function's own env
// SUPABASE_SERVICE_ROLE_KEY or the value stored in Vault under
// 'service_role_key' (resolved via the admin_get_service_role_key RPC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

let cachedVaultKey: string | null = null;

async function vaultServiceKey(): Promise<string | null> {
  if (cachedVaultKey !== null) return cachedVaultKey;
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.rpc('admin_get_service_role_key');
    if (error || typeof data !== 'string' || !data.length) return null;
    cachedVaultKey = data;
    return cachedVaultKey;
  } catch {
    return null;
  }
}

/** True when the caller presented the cron service credential. */
export async function isCronAuthorized(req: Request): Promise<boolean> {
  const presented =
    req.headers.get('x-cron-key') ??
    (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!presented) return false;
  if (SERVICE_KEY && safeEquals(presented, SERVICE_KEY)) return true;
  const vaultKey = await vaultServiceKey();
  return !!vaultKey && safeEquals(presented, vaultKey);
}
