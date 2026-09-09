import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// jobber-oauth-callback — DECOMMISSIONED (Sep 2026).
//
// No tokens are exchanged or stored. Inert, logged, always 200.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-oauth-callback',
  'Jobber is decommissioned; no tokens are exchanged or stored.',
));
