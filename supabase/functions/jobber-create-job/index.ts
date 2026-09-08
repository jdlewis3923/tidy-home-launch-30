// jobber-create-job — DECOMMISSIONED (Sep 2026).
//
// Job creation lives in the Tidy Pro Portal (visit generation + assignment).
// The Jobber jobCreate mutation this used never succeeded once in production
// ("JobCreateInput isn't a defined input type"), and it ran as a blocking
// call inside stripe-webhook provisioning. Both call sites are removed.
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
    detail: 'Jobs are created in the Tidy Pro Portal. This endpoint is inert.',
  });
});
