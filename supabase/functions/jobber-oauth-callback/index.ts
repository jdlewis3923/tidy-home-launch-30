// jobber-oauth-callback — DECOMMISSIONED (Sep 2026).
//
// No tokens are exchanged or persisted. Inert stub.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  return jsonResponse({
    ok: false,
    disabled: true,
    reason: 'jobber_decommissioned',
    detail: 'Jobber is no longer connected to the app.',
  }, 410);
});
