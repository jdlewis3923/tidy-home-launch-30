import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// sync-jobber-payouts — DECOMMISSIONED (Sep 2026).
//
// Pro pay is resolved from canon at visit creation and paid through Stripe
// Connect payout weeks. Nothing is imported from Jobber payroll.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'sync-jobber-payouts',
  'Pro pay is resolved locally from canon. This endpoint is inert.',
  { inserted: 0 },
));
