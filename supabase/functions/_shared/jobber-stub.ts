import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — inert Jobber stub helper (Sep 2026 decommission).
//
// Jobber is gone: dispatch is the Tidy Pro Portal. The former Jobber endpoints
// are kept as inert stubs so that any external caller still pointed at them —
// notably the six Zapier Zaps that have not been switched off yet — receives a
// clean 200 instead of an error.
//
// A silent 200 is a blind spot, so every stub call records one integration_logs
// row naming the function and the caller. That log is the list of Zaps still
// firing at Jobber, surfaced in Admin → Health.
//
// Contract, deliberately: this NEVER throws and NEVER returns non-2xx, no
// matter what payload arrives. A decommissioned integration must not be able
// to fail loudly at a Zap nobody has turned off yet. Body parsing is wrapped,
// logging is best-effort, and any internal error still yields 200.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from './cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DECOMMISSIONED_NOTE =
  'Jobber is decommissioned — dispatch is the Tidy Pro Portal. This endpoint is inert and wrote nothing. Turn this caller off at the source.';

/** Best guess at who called, from headers only. No payload contents are stored. */
function describeCaller(req: Request): Record<string, unknown> {
  const h = req.headers;
  const ua = h.get('user-agent') ?? '';
  const looksZapier = /zapier/i.test(ua) || h.has('x-zap-webhook-secret');
  return {
    user_agent: ua.slice(0, 200) || null,
    referer: h.get('referer')?.slice(0, 200) ?? null,
    origin: h.get('origin')?.slice(0, 200) ?? null,
    method: req.method,
    // Which credential style the caller used — tells a Zap apart from cron.
    auth_style: h.has('x-zap-webhook-secret')
      ? 'zap_webhook_secret'
      : h.has('x-cron-key')
        ? 'cron_key'
        : h.has('authorization')
          ? 'authorization_bearer'
          : h.has('apikey')
            ? 'apikey'
            : 'none',
    likely_zapier: looksZapier,
  };
}

/**
 * Records one integration_logs row for a stub call. Best-effort: any failure is
 * swallowed so a logging outage can never turn an inert stub into an error.
 */
export async function logJobberStubCall(req: Request, fnName: string): Promise<void> {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.from('integration_logs').insert({
      source: 'jobber',
      event: `decommissioned_stub_called:${fnName}`,
      status: 'warning',
      error_message: DECOMMISSIONED_NOTE,
      detail: { function: fnName, caller: describeCaller(req), note: DECOMMISSIONED_NOTE },
    });
  } catch (err) {
    console.warn('[jobber-stub] log failed', fnName, (err as Error)?.message ?? 'unknown');
  }
}

/**
 * Full handler for an inert Jobber endpoint. Always 200, always logs, never
 * throws — including on a payload the stub does not understand.
 */
export function serveJobberStub(
  fnName: string,
  detail: string,
  extraBody: Record<string, unknown> = {},
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      const pre = handleCors(req);
      if (pre) return pre;
      // Drain the body so an unparseable payload cannot surface as an error.
      try { await req.text(); } catch { /* ignore — payload is irrelevant now */ }
      await logJobberStubCall(req, fnName);
      return new Response(
        JSON.stringify({ ok: true, disabled: true, reason: 'jobber_decommissioned', detail, ...extraBody }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (err) {
      console.warn('[jobber-stub] swallowed', fnName, (err as Error)?.message ?? 'unknown');
      return new Response(
        JSON.stringify({ ok: true, disabled: true, reason: 'jobber_decommissioned', detail, ...extraBody }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  };
}
