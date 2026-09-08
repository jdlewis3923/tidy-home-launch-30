// Tidy — dependency-free integration logger.
//
// Writes one row to public.integration_logs over the REST endpoint, using only
// fetch + env, so it can be imported from helpers that also run under the unit
// test runner (where Deno.env does not exist and the write is skipped).
//
// Every vendor Tidy depends on gets a lane on /admin/health. A lane with zero
// calls in 24h reads as STALE there, not healthy — which is only true if the
// vendor calls are actually logged, hence this helper.

export type VendorSource =
  | 'stripe'
  | 'jobber'
  | 'brevo'
  | 'documenso'
  | 'checkr'
  | 'twilio'
  | 'google'
  | 'zapier'
  | 'meta_capi'
  | 'openai'
  | 'internal';

function env(name: string): string | undefined {
  const d = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  try {
    return d?.env?.get(name);
  } catch {
    return undefined;
  }
}

export async function logIntegrationEvent(opts: {
  source: VendorSource;
  event: string;
  status: 'success' | 'error' | 'warning';
  latency_ms?: number;
  error_message?: string | null;
}): Promise<void> {
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/integration_logs`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        source: opts.source,
        event: opts.event,
        status: opts.status,
        latency_ms: opts.latency_ms ?? 0,
        error_message: opts.error_message?.slice(0, 1000) ?? null,
      }),
    });
  } catch (e) {
    // Logging must never break the caller.
    console.error('[integration-log] write failed', (e as Error).message);
  }
}
