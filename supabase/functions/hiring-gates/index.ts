import '../_shared/http.ts';
/**
 * hiring-gates — hourly at :05, and callable on any relevant change.
 *
 * Evaluates every service gate, schedules or pulls go-live, and flips any
 * service whose scheduled 7:00 AM has arrived.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { evaluateGate, applyGate, promoteDueGoLives, type GateService } from '../_shared/hiring-gates.ts';

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

  const flipped = await promoteDueGoLives(admin);
  const results = [];
  for (const svc of SERVICES) {
    const gate = await evaluateGate(admin, svc);
    const applied = await applyGate(admin, gate);
    results.push({ ...gate, action: applied.action });
  }

  return new Response(
    JSON.stringify({ ok: true, went_live: flipped, gates: results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
