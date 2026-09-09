import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// jobber-sync-customer — DECOMMISSIONED (Sep 2026).
//
// Customers live in Lovable Cloud; there is no external CRM to mirror into.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-sync-customer',
  'Customer records are owned locally. This endpoint is inert.',
  { jobber_client_id: null },
));
