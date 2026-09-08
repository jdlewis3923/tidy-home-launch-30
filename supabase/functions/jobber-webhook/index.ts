// jobber-webhook — DECOMMISSIONED (Sep 2026).
//
// Inbound Jobber events are acknowledged and discarded. No verification, no
// network calls, no writes beyond the stub-call log row.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-webhook',
  'Inbound Jobber events are acknowledged and discarded.',
  { received: true },
));
