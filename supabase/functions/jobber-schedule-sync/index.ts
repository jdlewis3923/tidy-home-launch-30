import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// jobber-schedule-sync — DECOMMISSIONED (Sep 2026).
//
// Dispatch is the Tidy Pro Portal. This used to poll Jobber's GraphQL API every
// 15 minutes with a query Jobber rejected, producing a steady stream of 502s.
// Inert now, and every call is logged so we can see who is still calling.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-schedule-sync',
  'Scheduling is owned by the Tidy Pro Portal. This endpoint is inert.',
  { fetched: 0, upserts: 0 },
));
