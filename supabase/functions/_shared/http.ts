// Tidy — one outbound HTTP wrapper with per-vendor timeouts.
//
// WHY: an edge function that awaits a vendor with no deadline holds the whole
// invocation open. The sharp cases are webhook handlers (Twilio abandons an
// inbound webhook at ~15s and RETRIES it, producing duplicate replies) and any
// cron function that fans out to Twilio/Brevo one row at a time.
//
// Use `vendorFetch` exactly where you'd use `fetch`. The deadline is derived
// from the host so callers cannot forget one:
//
//   const resp = await vendorFetch(url, { method: 'POST', ... });
//
// A timeout surfaces as `HttpTimeoutError` (name: 'TimeoutError'), so existing
// try/catch paths treat it as the network failure it is.
//
// DELIBERATE EXCEPTION — the Lovable AI gateway is never given a deadline.
// Generation legitimately takes tens of seconds to minutes and an aborted call
// still bills, so anything that must return fast (webhooks) has to move the
// model call off the response path instead of racing it.

export class HttpTimeoutError extends Error {
  readonly url: string;
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs: number) {
    super(`request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.url = url;
    this.timeoutMs = timeoutMs;
  }
}

/** Hosts we never bound: model inference. */
const UNBOUNDED_HOSTS = ['ai.gateway.lovable.dev'];

/** Per-vendor deadlines, in ms. Longest suffix match on the hostname wins. */
const VENDOR_TIMEOUTS: Array<[string, number]> = [
  ['api.twilio.com', 10_000],
  ['api.brevo.com', 15_000],
  ['connector-gateway.lovable.dev', 20_000],
  ['api.stripe.com', 20_000],
  ['api.checkr.com', 15_000],
  ['api.checkr-staging.com', 15_000],
  ['graph.facebook.com', 20_000],
  ['googleapis.com', 20_000],
  ['google.com', 15_000],
  ['hooks.zapier.com', 10_000],
  ['app.documenso.com', 20_000],
  ['documenso.com', 20_000],
  ['api.openai.com', 60_000],
];

/** Anything else, including our own functions/REST calling each other. */
export const DEFAULT_TIMEOUT_MS = 25_000;

export function timeoutForUrl(url: string): number | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return DEFAULT_TIMEOUT_MS;
  }
  if (UNBOUNDED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  let best: number | null = null;
  let bestLen = -1;
  for (const [suffix, ms] of VENDOR_TIMEOUTS) {
    if ((host === suffix || host.endsWith(`.${suffix}`)) && suffix.length > bestLen) {
      best = ms;
      bestLen = suffix.length;
    }
  }
  return best ?? DEFAULT_TIMEOUT_MS;
}

/**
 * `fetch` with a host-derived deadline. Pass `timeoutMs` to override, or
 * `timeoutMs: 0` to opt out explicitly (only for streamed model calls).
 */
export async function vendorFetch(
  input: string | URL | Request,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs, ...rest } = init;
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const budget = timeoutMs === undefined ? timeoutForUrl(url) : (timeoutMs > 0 ? timeoutMs : null);
  if (budget === null) return fetch(input as RequestInfo, rest);

  const controller = new AbortController();
  // Respect a caller-supplied signal as well.
  const outer = rest.signal;
  if (outer) {
    if (outer.aborted) controller.abort(outer.reason);
    else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true });
  }
  const timer = setTimeout(() => controller.abort(new HttpTimeoutError(url, budget)), budget);
  try {
    return await fetch(input as RequestInfo, { ...rest, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted && controller.signal.reason instanceof HttpTimeoutError) {
      throw controller.signal.reason;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export default vendorFetch;
