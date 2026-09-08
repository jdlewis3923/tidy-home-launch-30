// jobber-sync-customer — DECOMMISSIONED (Sep 2026).
//
// Customer records live in Lovable Cloud (profiles + subscriptions) and
// dispatch is the Tidy Pro Portal. Existing subscriptions.jobber_client_id
// values are left in place as dead data.
//
// Inert 200 stub: no Jobber call, no writes.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  return jsonResponse({
    ok: true,
    disabled: true,
    reason: 'jobber_decommissioned',
    detail: 'Customers are not mirrored to Jobber. This endpoint is inert.',
  });
});
