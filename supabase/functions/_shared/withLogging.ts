// Tidy — Edge function instrumentation helper.
//
// Wraps any async work with timing + structured logging into the
// `integration_logs` table. Re-throws errors after recording so the
// caller can still translate them into HTTP responses.
//
// Usage:
//   const result = await withLogging({
//     source: 'stripe',
//     event: 'checkout.session.create',
//     payload: { config },
//     fn: async () => stripe.checkout.sessions.create(params),
//   });

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type LogSource =
  | 'stripe'
  | 'jobber'
  | 'resend'
  | 'twilio'
  | 'zapier'
  | 'meta_capi'
  | 'internal';

export type LogStatus = 'success' | 'error' | 'warning';

interface WithLoggingOpts<T> {
  source: LogSource;
  event: string;
  /** Arbitrary payload — we hash it for traceability without storing PII. */
  payload?: unknown;
  fn: () => Promise<T>;
}

let _client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPayload(payload: unknown): Promise<string | null> {
  if (payload === undefined || payload === null) return null;
  try {
    const json = JSON.stringify(payload).slice(0, 500);
    return await sha256(json);
  } catch {
    return null;
  }
}

async function record(
  source: LogSource,
  event: string,
  status: LogStatus,
  latency_ms: number,
  payload_hash: string | null,
  error_message: string | null,
): Promise<void> {
  try {
    const supabase = getServiceClient();
    await supabase.from('integration_logs').insert({
      source,
      event,
      status,
      latency_ms,
      payload_hash,
      error_message,
    });
  } catch (err) {
    // Logging must never break the host function.
    console.error('[withLogging] failed to write integration_logs', err);
  }
}

export async function withLogging<T>(opts: WithLoggingOpts<T>): Promise<T> {
  const { source, event, payload, fn } = opts;
  const start = performance.now();
  const payload_hash = await hashPayload(payload);

  try {
    const result = await fn();
    const latency_ms = Math.round(performance.now() - start);
    await record(source, event, 'success', latency_ms, payload_hash, null);
    return result;
  } catch (err) {
    const latency_ms = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    await record(source, event, 'error', latency_ms, payload_hash, message.slice(0, 1000));
    throw err;
  }
}
