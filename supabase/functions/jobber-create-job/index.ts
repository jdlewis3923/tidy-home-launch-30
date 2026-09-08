// jobber-create-job — DECOMMISSIONED (Sep 2026).
//
// Jobs and visits are created locally by the visit lifecycle engine. The Jobber
// jobCreate mutation never once succeeded (invalid input type). Inert now.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'jobber-create-job',
  'Recurring jobs are generated locally by the visit engine. This endpoint is inert.',
  { jobber_job_ids: {} },
));
