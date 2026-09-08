// add-jobber-line-item — DECOMMISSIONED (Sep 2026).
//
// Add-ons ride the Pro Portal job card and are billed through Stripe.
import { serveJobberStub } from '../_shared/jobber-stub.ts';

Deno.serve(serveJobberStub(
  'add-jobber-line-item',
  'Add-ons ride the Pro Portal job card. This endpoint is inert.',
  { jobber_line_item_id: null },
));
