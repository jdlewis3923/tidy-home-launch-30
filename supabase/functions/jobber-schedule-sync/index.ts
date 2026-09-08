// jobber-schedule-sync — DECOMMISSIONED (Sep 2026).
//
// Dispatch is the Tidy Pro Portal: visits are generated locally, assigned
// locally, carried on the local job card and paid locally. This function
// used to poll Jobber's GraphQL API every 15 minutes with a query Jobber
// rejected ("Selections can't be made on scalars"), producing a steady
// stream of 502s and buying nothing.
//
// Kept as an inert 200 stub so any external caller stops erroring. It makes
// no network calls and writes nothing.

import { handleCors, jsonResponse } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  return jsonResponse({
    ok: true,
    disabled: true,
    reason: 'jobber_decommissioned',
    detail: 'Scheduling is owned by the Tidy Pro Portal. This endpoint is inert.',
  });
});
