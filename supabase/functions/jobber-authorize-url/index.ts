// jobber-authorize-url — DECOMMISSIONED (Sep 2026).
//
// There is no Jobber connection to authorize. This is an admin/browser path,
// never a Zap target, so it stays inert with a 200 and a log row for
// consistency with the other stubs.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-authorize-url',
  'Jobber is decommissioned; there is no connection to authorize.',
  { url: null },
));
