import '../_shared/http.ts';
/**
 * hiring-mark-hired — the trigger chain, server side.
 *
 *  1. Refuse unless Checkr is clear AND the COI is verified.
 *  2. applicant -> hired, linked to the lowest open opening for that service,
 *     that opening -> filled.
 *  3. "Pause the Indeed sponsorship" action alert.
 *  4. Re-run the service gate (may schedule go-live for 7:00 AM).
 *  5. Create the next opening and forecast it.
 *
 * Every other applicant for that service is left exactly where it is.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { evaluateGate, applyGate, type GateService } from '../_shared/hiring-gates.ts';
import { forecastService } from '../_shared/hiring-forecast.ts';

const LABEL: Record<string, string> = {
  cleaning: 'house cleaning',
  lawn: 'lawn care',
  car_care: 'car care',
  ops_coordinator: 'operations coordinator',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  let applicantId = '';
  try {
    applicantId = String((await req.json())?.applicant_id ?? '');
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(applicantId)) {
    return json({ ok: false, error: 'applicant_id_required' }, 400);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const { data: applicant, error } = await admin
    .from('applicants')
    .select('id, first_name, last_name, service, bg_check_status, coi_general_liability_status, queue_state')
    .eq('id', applicantId)
    .maybeSingle();

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!applicant) return json({ ok: false, error: 'applicant_not_found' }, 404);

  // ---- 1. the two blocking conditions
  const checkrClear =
    String(applicant.bg_check_status ?? '') === 'clear';
  const coiVerified = String(applicant.coi_general_liability_status ?? '') === 'verified';
  const blockers: string[] = [];
  if (!checkrClear) blockers.push('background check is not clear yet');
  if (!coiVerified) blockers.push('certificate of insurance is not verified yet');
  if (blockers.length) {
    return json({ ok: false, error: 'blocked', blockers }, 409);
  }

  const service = String(applicant.service ?? '').split(/[,\s]+/)[0] as GateService;
  const name = `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim();

  // ---- 2. link to the lowest open opening, mark it filled
  const { data: openings } = await admin
    .from('hiring_openings')
    .select('id, slot_number, status')
    .eq('service', service)
    .not('status', 'in', '("filled","cancelled")')
    .order('slot_number', { ascending: true })
    .limit(1);

  let opening = openings?.[0] ?? null;
  if (!opening) {
    const { data: created } = await admin
      .from('hiring_openings')
      .insert({ service, slot_number: 1, status: 'posted', posted_at: new Date().toISOString(), trigger_reason: 'created on hire' })
      .select('id, slot_number, status')
      .maybeSingle();
    opening = created ?? null;
  }

  const nowIso = new Date().toISOString();
  if (opening) {
    await admin
      .from('hiring_openings')
      .update({ status: 'filled', filled_at: nowIso, filled_by_applicant_id: applicant.id })
      .eq('id', opening.id);
  }

  await admin
    .from('applicants')
    .update({ queue_state: 'hired', opening_id: opening?.id ?? null })
    .eq('id', applicant.id);

  // ---- 3. pause the Indeed sponsorship
  await writeAlert(admin, {
    level: 'action',
    category: 'hiring',
    title: `Pause the Indeed sponsorship for the ${LABEL[service] ?? service} job today (about $24/day while it runs)`,
    body: `${name || 'A contractor'} was hired, so the sponsored listing is now spending on a filled slot.`,
    action_label: 'Open Indeed',
    action_url: 'https://employers.indeed.com/jobs',
    due_date: nowIso.slice(0, 10),
    dedupe_key: `indeed_pause_${service}_${opening?.id ?? applicant.id}`,
    context: { service, opening_id: opening?.id ?? null, applicant_id: applicant.id },
  });

  // ---- 4. re-run the gate for this service
  const gate = await evaluateGate(admin, service);
  const gateAction = await applyGate(admin, gate);

  // ---- 5. next opening + forecast
  const { data: maxSlot } = await admin
    .from('hiring_openings')
    .select('slot_number')
    .eq('service', service)
    .order('slot_number', { ascending: false })
    .limit(1);

  const nextSlot = Number(maxSlot?.[0]?.slot_number ?? 0) + 1;
  const { data: nextOpening } = await admin
    .from('hiring_openings')
    .insert({
      service,
      slot_number: nextSlot,
      status: 'not_needed_yet',
      trigger_reason: 'created automatically after a hire',
    })
    .select('id, slot_number, status')
    .maybeSingle();

  const forecast = await forecastService(admin, service);

  await admin.from('onboarding_events').insert({
    applicant_id: applicant.id,
    event: 'marked_hired',
    metadata: { service, opening_id: opening?.id ?? null, next_opening_id: nextOpening?.id ?? null },
  }).then(() => {}, () => {});

  return json({
    ok: true,
    applicant_id: applicant.id,
    filled_opening_id: opening?.id ?? null,
    next_opening: nextOpening,
    gate: { green: gate.green, action: gateAction.action, scheduled_for: gate.scheduled_for, conditions: gate.conditions },
    forecast,
  });
});
