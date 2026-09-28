import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * sequence-advance — the one button on a Pro's card.
 *
 * POST { applicant_id, action, scheduled_at?, date?, key?, value? }
 * The server re-checks the stage and the gate before doing anything. A gate
 * failure is refused and written to Workday. Emails welded to a transition
 * are sent through pro-email → sendProEmail (the single send door); the stage
 * only moves when that email actually sent.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { NEXT_ACTION, gateMissing, CONFIRMATION_TICKS, type SequenceStage, type GateFacts } from '../_shared/onboarding-sequence.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function facts(id: string) {
  const { data: a } = await admin.from('applicants').select('*').eq('id', id).maybeSingle();
  if (!a) return null;
  const { data: kit } = await admin.from('pro_kit').select('id, status, badge_photo_status, expected_delivery_date')
    .eq('applicant_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  const f: GateFacts = {
    ...a, kit_status: kit?.status ?? null, badge_photo_status: kit?.badge_photo_status ?? null,
    expected_delivery_date: kit?.expected_delivery_date ?? null,
  };
  return { a, kit, f };
}

async function sendEmail(applicant_id: string, email: string) {
  const r = await vendorFetch(`${URL_}/functions/v1/pro-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({ applicant_id, email, mode: 'send', sequence: 'transition' }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok === true, detail: j };
}

async function workday(applicant_id: string, type: string, title: string, detail: string, status: string, actor: string | null, meta: Record<string, unknown> = {}) {
  await admin.from('admin_workday_events').insert({
    event_type: type, applicant_id, actor_type: actor ? 'admin' : 'system', actor_user_id: actor, title, detail, status,
    waiting_on_admin: status === 'blocked', metadata: meta,
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const actor = auth.kind === 'admin' ? auth.userId : null;

  const body = await req.json().catch(() => ({}));
  const { applicant_id, action } = body as { applicant_id?: string; action?: string };
  if (!applicant_id || !action) return jsonResponse({ error: 'invalid_request' }, 400);
  const loaded = await facts(applicant_id);
  if (!loaded) return jsonResponse({ error: 'applicant_not_found' }, 404);
  const { a, kit, f } = loaded;
  const stage = (a.sequence_stage ?? 'applied') as SequenceStage;
  const name = a.first_name ?? 'Pro';

  // Ticks (facts the system can't observe) and exits are allowed at any stage.
  if (action === 'confirm') {
    const key = String(body.key ?? '');
    if (!CONFIRMATION_TICKS.some((t) => t.key === key)) return jsonResponse({ error: 'unknown_tick' }, 400);
    const gc = { ...(a.gate_confirmations ?? {}), [key]: body.value === true };
    await admin.from('applicants').update({ gate_confirmations: gc }).eq('id', applicant_id);
    await workday(applicant_id, 'gate_tick', `${name}: ${key} ${body.value === true ? 'ticked' : 'unticked'}`, '', 'info', actor, { key });
    return jsonResponse({ ok: true });
  }
  if (action === 'decline') {
    if (stage === 'declined') return jsonResponse({ ok: true, action: 'already_declined' });
    const e = a.email ? await sendEmail(applicant_id, 'decline') : { ok: true, detail: { note: 'no email on file' } };
    await admin.from('applicants').update({ sequence_stage: 'declined', current_stage: 'rejected' }).eq('id', applicant_id);
    return jsonResponse({ ok: true, email: e.detail });
  }
  if (action === 'hold') {
    await admin.from('applicants').update({ sequence_stage: 'hold' }).eq('id', applicant_id);
    return jsonResponse({ ok: true });
  }

  const next = NEXT_ACTION[stage];
  if (!next || next.action !== action) {
    await workday(applicant_id, 'gate_failed', `Refused: ${action} for ${name}`, `Not the next step at stage "${stage}"`, 'blocked', actor, { action, stage });
    return jsonResponse({ ok: false, error: 'wrong_stage', stage, expected: next?.action ?? null }, 409);
  }
  if (next.gate) {
    const missing = gateMissing(next.gate, f);
    if (missing.length) {
      await workday(applicant_id, 'gate_failed', `Gate ${next.gate} locked: ${next.label} for ${name}`, `Missing: ${missing.join(', ')}`, 'blocked', actor, { gate: next.gate, missing });
      return jsonResponse({ ok: false, error: 'gate_locked', gate: next.gate, missing }, 409);
    }
  }

  const move = async (to: SequenceStage, extra: Record<string, unknown> = {}) => {
    const { error } = await admin.from('applicants').update({ sequence_stage: to, ...extra }).eq('id', applicant_id).eq('sequence_stage', stage);
    if (error) throw new Error(error.message);
  };

  try {
    switch (action) {
      case 'start_screening': await move('screening'); break;
      case 'resume': await move('screening'); break;
      case 'book_interview': {
        const at = String(body.scheduled_at ?? '');
        if (!at || Number.isNaN(Date.parse(at))) return jsonResponse({ error: 'scheduled_at_required' }, 400);
        await admin.from('applicants').update({ call_at: new Date(at).toISOString() }).eq('id', applicant_id);
        const e = await sendEmail(applicant_id, 'interview_confirmed');
        if (!e.ok) return jsonResponse({ ok: false, error: 'email_not_sent', detail: e.detail }, 502);
        await move('interview_booked');
        break;
      }
      case 'send_onboarding': {
        // Background check invitation first, so the onboarding email carries its link (skips quietly if Checkr is not connected).
        await vendorFetch(`${URL_}/functions/v1/checkr-invite`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({ applicant_id }),
        }).catch(() => null);
        const e = await sendEmail(applicant_id, 'onboarding');
        if (!e.ok) return jsonResponse({ ok: false, error: 'email_not_sent', detail: e.detail }, 502);
        await move('waiting');
        break;
      }
      case 'send_contract': {
        const e = await sendEmail(applicant_id, 'contract');
        if (!e.ok) return jsonResponse({ ok: false, error: 'email_not_sent', detail: e.detail }, 502);
        await move('contract_sent');
        break;
      }
      case 'review_photo': return jsonResponse({ ok: true, open: '/admin/badges' });
      case 'kit_ordered': {
        const date = String(body.date ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ error: 'date_required' }, 400);
        if (!kit?.id) return jsonResponse({ error: 'no_kit_record', missing: ['intake'] }, 409);
        await admin.from('pro_kit').update({ expected_delivery_date: date, status: 'ordered' }).eq('id', kit.id);
        await move('kit_ordered');
        // Gate C is checked inside pro-all-set; it moves the stage to all_set if it sends.
        await vendorFetch(`${URL_}/functions/v1/pro-all-set`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` },
          body: JSON.stringify({ applicant_id }),
        }).catch(() => null);
        break;
      }
      case 'mark_active': {
        const e = await sendEmail(applicant_id, 'first_route');
        if (!e.ok) return jsonResponse({ ok: false, error: 'email_not_sent', detail: e.detail }, 502);
        await move('active', { current_stage: 'active' });
        break;
      }
      default: return jsonResponse({ error: 'unknown_action' }, 400);
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: 'update_failed', detail: (err as Error).message }, 500);
  }
  const { data: after } = await admin.from('applicants').select('sequence_stage').eq('id', applicant_id).maybeSingle();
  return jsonResponse({ ok: true, stage: after?.sequence_stage ?? null });
});
