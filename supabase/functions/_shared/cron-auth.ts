import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — shared cron auth helper.
//
// pg_cron jobs must not embed any credential in cron.job.command, so they read
// the service credential from Vault at call time and send it as x-cron-key.
// This helper accepts a key that matches EITHER the function's own env
// SUPABASE_SERVICE_ROLE_KEY or the value stored in Vault under
// 'service_role_key' (resolved via the admin_get_service_role_key RPC).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { vendorFetch } from './http.ts';

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

/**
 * One row per cron invocation, written from the receiving side.
 *
 * This is the only durable proof that a scheduled job reached its function: the
 * pg_net response table keeps a single live row, cannot be indexed by us, and a
 * lookup seq-scans gigabytes. A refused call (401) is recorded too — that is
 * exactly the failure that used to leave the job showing green.
 */
async function recordCronAck(req: Request, authorized: boolean): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    const fn = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? 'unknown';
    await vendorFetch(`${SUPABASE_URL}/rest/v1/cron_acks`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        job_name: req.headers.get('x-cron-job') ?? fn,
        fn,
        authorized,
      }),
    });
  } catch (e) {
    console.error('[cron-auth] ack write failed', (e as Error).message);
  }
}

/** True when the caller presented the cron service credential. */
export async function isCronAuthorized(req: Request): Promise<boolean> {
  const presented =
    req.headers.get('x-cron-key') ??
    (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');

  let ok = false;
  if (presented) {
    if (SERVICE_KEY && safeEquals(presented, SERVICE_KEY)) ok = true;
    else {
      const vaultKey = await vaultServiceKey();
      ok = !!vaultKey && safeEquals(presented, vaultKey);
    }
  }

  // Only record calls that look like scheduled dispatches, so ad-hoc probes do
  // not overwrite a job's real last-seen state.
  if (req.headers.get('x-cron-job') || presented) await recordCronAck(req, ok);
  return ok;
}

