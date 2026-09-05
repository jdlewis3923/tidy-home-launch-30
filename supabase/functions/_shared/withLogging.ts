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

/**
 * Record an invocation at function entry — BEFORE any auth check, env read or
 * work happens — so a crash still leaves a row in integration_logs and the
 * Health page shows an error instead of silence.
 *
 * Never throws. Returns a finalizer that upgrades the row's status once the
 * outcome is known.
 */
export async function logInvocation(
  source: LogSource,
  event: string,
  payload?: unknown,
): Promise<(status: LogStatus, error_message?: string | null) => Promise<void>> {
  const start = performance.now();
  let id: string | null = null;
  const payload_hash = await hashPayload(payload).catch(() => null);

  try {
    const supabase = getServiceClient();
    const { data } = await supabase
      .from('integration_logs')
      .insert({
        source,
        event: `${event}.invoked`,
        status: 'warning',
        latency_ms: 0,
        payload_hash,
        error_message: 'in_flight — no outcome recorded yet',
      })
      .select('id')
      .maybeSingle();
    id = (data as { id?: string } | null)?.id ?? null;
  } catch (err) {
    console.error('[logInvocation] failed to write entry row', err);
  }

  return async (status: LogStatus, error_message: string | null = null) => {
    const latency_ms = Math.round(performance.now() - start);
    try {
      const supabase = getServiceClient();
      if (id) {
        await supabase
          .from('integration_logs')
          .update({ status, latency_ms, error_message: error_message?.slice(0, 1000) ?? null })
          .eq('id', id);
      } else {
        await record(source, `${event}.invoked`, status, latency_ms, payload_hash, error_message);
      }
    } catch (err) {
      console.error('[logInvocation] failed to finalize entry row', err);
    }
  };
}
