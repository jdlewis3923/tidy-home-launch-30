// add-jobber-line-item — DECOMMISSIONED (Sep 2026).
//
// Approved add-ons are billed through Stripe and shown to the pro on the
// Tidy Pro Portal job card. Nothing pushes line items into Jobber.
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
    detail: 'Add-ons ride the Pro Portal job card. This endpoint is inert.',
  });
});
