// Tidy — admin actions on a Redo task: schedule (creates the free return
// visit, Pro paid 50% of the original visit rate) or cancel.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('schedule'), redo_id: z.string().uuid(), scheduled_start: z.string().datetime({ offset: true }), duration_minutes: z.number().int().min(30).max(480).optional() }),
  z.object({ action: z.literal('cancel'), redo_id: z.string().uuid(), reason: z.string().trim().max(300).optional() }),
]);

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;

  const { data: redo } = await admin.from('redo_requests').select('*').eq('id', b.redo_id).maybeSingle();
  if (!redo) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (redo.status !== 'open') return jsonResponse({ ok: false, error: 'not_open', status: redo.status }, 409);

  if (b.action === 'cancel') {
    await admin.from('redo_requests').update({ status: 'canceled', resolved_at: new Date().toISOString(), admin_notes: b.reason ?? null }).eq('id', redo.id);
    await admin.from('admin_workday_events').insert({ event_type: 'redo_canceled', applicant_id: redo.applicant_id, actor_type: 'admin', actor_user_id: auth.userId, title: 'Redo canceled', detail: b.reason ?? null, metadata: { redo_id: redo.id } });
    return jsonResponse({ ok: true, status: 'canceled' });
  }

  const { data: orig } = await admin.from('visits').select('*').eq('id', redo.visit_id).maybeSingle();
  if (!orig) return jsonResponse({ ok: false, error: 'visit_missing' }, 404);
  const start = new Date(b.scheduled_start);
  const end = new Date(start.getTime() + (b.duration_minutes ?? 120) * 60_000);
  const visitDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  // Return visit: free to the member (no charge is created anywhere), Pro paid 50% of the original rate.
  const halfBase = orig.contractor_pay_cents != null ? Math.round(orig.contractor_pay_cents / 2) : null;

  const { data: nv, error } = await admin.from('visits').insert({
    user_id: orig.user_id, subscription_id: orig.subscription_id, service: orig.service, service_type: orig.service_type,
    visit_date: visitDate, scheduled_start: start.toISOString(), scheduled_end: end.toISOString(),
    assigned_pro_id: orig.assigned_pro_id, street: orig.street, zip: orig.zip, customer_first_name: orig.customer_first_name,
    access_notes: orig.access_notes, gate_code: orig.gate_code, pet_notes: orig.pet_notes, parking_notes: orig.parking_notes,
    size_tier: orig.size_tier, cadence: orig.cadence, visit_kind: orig.visit_kind, contractor_pay_cents: halfBase,
    notes: `48-hour guarantee return visit.${redo.note ? ` Member said: ${redo.note}` : ''}`,
    lifecycle_reason: 'redo_48h_guarantee', is_redo: true, redo_of_visit_id: orig.id, redo_request_id: redo.id,
    is_sample: orig.is_sample, status: 'scheduled',
  }).select('id, visit_pay_cents').single();
  if (error) return jsonResponse({ ok: false, error: 'visit_insert_failed', details: error.message }, 500);

  const now = new Date().toISOString();
  await admin.from('redo_requests').update({ status: 'scheduled', redo_visit_id: nv.id, scheduled_for: start.toISOString(), scheduled_at: now }).eq('id', redo.id);
  const onTime = Date.parse(now) <= Date.parse(redo.due_at);
  await admin.from('admin_workday_events').insert({
    event_type: 'redo_scheduled', applicant_id: redo.applicant_id, actor_type: 'admin', actor_user_id: auth.userId,
    title: `Redo scheduled ${onTime ? 'within' : 'AFTER'} the 48-hour window`,
    detail: `Return visit ${start.toLocaleString('en-US', { timeZone: 'America/New_York' })} · free to member · Pro paid ${nv.visit_pay_cents != null ? `$${(nv.visit_pay_cents / 100).toFixed(2)}` : '50% of rate'}`,
    status: onTime ? 'ok' : 'late', metadata: { redo_id: redo.id, redo_visit_id: nv.id },
  });
  return jsonResponse({ ok: true, status: 'scheduled', redo_visit_id: nv.id, visit_pay_cents: nv.visit_pay_cents, on_time: onTime });
});
