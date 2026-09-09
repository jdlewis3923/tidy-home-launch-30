// Tidy — per-identifier rate limiting for the unauthenticated edge functions.
//
// The Supabase gateway rate limits AUTH endpoints only (sign-up/sign-in/OTP);
// it does not cap function invocations, so every open endpoint needed its own
// limit. Counters live in public.rate_limit_hits (service-role only) via the
// rate_limit_take RPC, so the limit survives isolate recycling and can be
// audited after the fact.
//
// Usage:
//   const limited = await enforceRateLimit(req, { bucket: 'submit-lead', limit: 5, windowSeconds: 300 });
//   if (limited) return limited;   // 429 with Retry-After
//
// FAIL-OPEN on infrastructure error, by design: a database hiccup must not stop
// a customer submitting a rating or a lead. It logs loudly instead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from './cors.ts';

export interface RateLimitOptions {
  /** Endpoint name — one counter namespace per endpoint. */
  bucket: string;
  limit: number;
  windowSeconds: number;
  /** Extra identifier (phone, email, visit id). Defaults to the caller IP. */
  identifier?: string;
}

/** Best-effort caller IP from the gateway headers. */
export function callerIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return (
    first ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    'unknown'
  ).slice(0, 100);
}

export interface RateLimitDecision {
  allowed: boolean;
  count?: number;
  retryAfterSeconds?: number;
}

export async function checkRateLimit(
  req: Request,
  opts: RateLimitOptions,
): Promise<RateLimitDecision> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return { allowed: true };

  const identifier = (opts.identifier?.trim() || `ip:${callerIp(req)}`).slice(0, 200);
  try {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await admin.rpc('rate_limit_take', {
      _bucket: opts.bucket,
      _identifier: identifier,
      _limit: opts.limit,
      _window_seconds: opts.windowSeconds,
    });
    if (error) {
      console.error('[rate-limit] rpc failed', opts.bucket, error.message);
      return { allowed: true };
    }
    const row = (data ?? {}) as { allowed?: boolean; count?: number; retry_after_seconds?: number };
    if (row.allowed === false) {
      console.warn('[rate-limit] blocked', opts.bucket, identifier, row.count);
      return { allowed: false, count: row.count, retryAfterSeconds: row.retry_after_seconds ?? opts.windowSeconds };
    }
    return { allowed: true, count: row.count };
  } catch (e) {
    console.error('[rate-limit] error', opts.bucket, e instanceof Error ? e.message : e);
    return { allowed: true };
  }
}

/**
 * Returns a ready-to-send 429 Response when the caller is over the limit, or
 * null when the request may proceed.
 */
export async function enforceRateLimit(
  req: Request,
  opts: RateLimitOptions,
): Promise<Response | null> {
  const decision = await checkRateLimit(req, opts);
  if (decision.allowed) return null;
  const retry = decision.retryAfterSeconds ?? opts.windowSeconds;
  return new Response(
    JSON.stringify({ ok: false, error: 'rate_limited', retry_after_seconds: retry }),
    {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': String(retry) },
    },
  );
}
