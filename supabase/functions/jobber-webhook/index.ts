// jobber-webhook — DECOMMISSIONED (Sep 2026).
//
// Jobber never delivered a single webhook to this endpoint (jobber_webhook_log
// is empty), and every state it used to mirror — visit status, contractor
// counters, preferred-pro substitution — is now owned by the Tidy Pro Portal.
//
// Kept as an inert 200 acknowledgement so a stray delivery does not retry
// forever. It verifies nothing, calls nothing, and writes nothing.

import { corsHeaders, handleCors } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  return new Response(
    JSON.stringify({
      ok: true,
      disabled: true,
      reason: 'jobber_decommissioned',
      function: 'jobber-webhook',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
