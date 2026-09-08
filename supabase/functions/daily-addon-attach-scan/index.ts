// daily-addon-attach-scan — DECOMMISSIONED (Sep 2026).
//
// The only source of visits this scanner had was Jobber's GraphQL API, which
// the app no longer talks to. Add-on attach SMS is now driven off locally
// generated visits; send-addon-attach-sms is untouched and still callable
// directly with { user_id, visit_date, service }.
//
// Inert 200 stub so the external schedule trigger stops erroring.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isServiceOrZapAuthorized } from '../_shared/zap-auth.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!isServiceOrZapAuthorized(req)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
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
