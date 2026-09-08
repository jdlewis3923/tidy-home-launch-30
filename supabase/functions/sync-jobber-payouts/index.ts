// sync-jobber-payouts — DECOMMISSIONED (Sep 2026).
//
// Contractor pay is resolved locally from canon (40% of the visit price,
// Tier 2 uplift, surcharge share) and paid through payout weeks. No payroll
// record was ever imported from Jobber (cost_entries has zero source='jobber'
// rows).
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
    inserted: 0,
    detail: 'Pay is resolved locally from canon. This endpoint is inert.',
  });
});
