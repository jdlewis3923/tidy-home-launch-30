import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// daily-addon-attach-scan — DECOMMISSIONED (Sep 2026).
//
// The only source of visits this scanner had was Jobber's GraphQL API, which
// the app no longer talks to. Add-on attach SMS is now driven off locally
// generated visits; send-addon-attach-sms is untouched and still callable
// directly with { user_id, visit_date, service }.
//
// Inert 200 stub. Every call is recorded in integration_logs so we can see who
// is still pointed at it. Never non-2xx for an authorized caller, whatever the
// payload looks like.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isServiceOrZapAuthorized } from '../_shared/zap-auth.ts';
import { logJobberStubCall } from '../_shared/jobber-stub.ts';

Deno.serve(async (req) => {
  try {
    const pre = handleCors(req);
    if (pre) return pre;
    if (!isServiceOrZapAuthorized(req)) {
      return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    }
    try { await req.text(); } catch { /* payload is irrelevant now */ }
    await logJobberStubCall(req, 'daily-addon-attach-scan');
  } catch (err) {
    console.warn('[daily-addon-attach-scan] swallowed', (err as Error)?.message ?? 'unknown');
  }
  return jsonResponse({
    ok: true,
    disabled: true,
    reason: 'jobber_decommissioned',
    scanned: 0,
    sent: 0,
    suppressed: 0,
    errors: 0,
  });
});
