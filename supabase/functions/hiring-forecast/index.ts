import '../_shared/http.ts';
/**
 * hiring-forecast — nightly at 2:00 AM, and on every hire or new subscription.
 * Also rescores every applicant (the 2:15 AM pass calls this with rescore=true).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { forecastService, forecastOpsCoordinator } from '../_shared/hiring-forecast.ts';
import type { GateService } from '../_shared/hiring-gates.ts';

const SERVICES: GateService[] = ['cleaning', 'lawn', 'car_care'];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Scheduled dispatches present the cron credential; admins call it by hand.
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const services = [];
  for (const svc of SERVICES) services.push(await forecastService(admin, svc));
  const ops = await forecastOpsCoordinator(admin);

  return new Response(JSON.stringify({ ok: true, services, ops }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
