import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * hiring-candidate — public, token-only backend for the v5 candidate flow.
 *   start        → begin an application (service, language) → resume token
 *   load         → question bank (by service+lang), saved answers, candidate FAQ
 *   answer       → autosave one answer (upsert application_answers)
 *   submit       → validate required + knockouts, stamp apply_submitted_at, totals
 *   slots        → open phone / in-person slots for booking
 *   book         → claim a slot (phone at proof stage, in_person after phone PASS)
 *   confirm      → CONFIRM the in-person slot (2-hour window)
 *   checkin      → reply to the weekly check-in
 *   faq          → candidate-visible FAQ rows (tokens filled server-side)
 * No login. The resume token is the only credential; it is 48 hex chars.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SERVICES = ['cleaning', 'lawn', 'car_care'];

type Pipeline = Record<string, unknown> & { applicant_id: string };

async function loadByToken(token: unknown): Promise<{ p: Pipeline; a: Record<string, unknown> } | null> {
  if (typeof token !== 'string' || token.length < 32) return null;
  const { data: p } = await admin.from('contractor_pipeline').select('*').eq('apply_resume_token', token).maybeSingle();
  if (!p) return null;
  const { data: a } = await admin.from('applicants').select('*').eq('id', p.applicant_id).maybeSingle();
  if (!a) return null;
  return { p: p as Pipeline, a };
}

async function questionsFor(service: string) {
  const { data } = await admin.from('question_bank').select('*').eq('active', true)
    .in('service', ['all', service]).order('section').order('sort');
  return data ?? [];
}

async function faqFor(lang: string) {
  const { data } = await admin.from('candidate_faq').select('*').eq('candidate_visible', true).order('sort');
  const { data: lc } = await admin.from('launch_config').select('scope, first_visit_date, pro_ready_by');
  const dates: Record<string, { launch?: string; ready?: string }> = {};
  for (const r of lc ?? []) dates[r.scope] = { launch: r.first_visit_date ?? undefined, ready: r.pro_ready_by ?? undefined };
  const fill = (s: string, scope: string) => s
    .replaceAll('{launch}', dates[scope]?.launch ?? dates.cleaning?.launch ?? '')
    .replaceAll('{pro_ready_by}', dates[scope]?.ready ?? dates.cleaning?.ready ?? '');
  return (data ?? []).map((f) => ({
    q: lang === 'es' ? f.q_es : f.q_en,
    a: fill(lang === 'es' ? f.a_es : f.a_en, 'cleaning'),
    needs_justin: f.needs_justin && !(lang === 'es' ? f.a_es : f.a_en),
  }));
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? '');

  // ---- start: create applicant + pipeline row at 'invited', return resume token
  if (action === 'start') {
    const service = String(body?.service ?? '');
    const lang = body?.lang === 'es' ? 'es' : 'en';
    if (!SERVICES.includes(service)) return jsonResponse({ error: 'unknown_service' }, 400);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const { data: a, error: aErr } = await admin.from('applicants').insert({
      first_name: '', last_name: '', phone: '', email: `pending-${token.slice(0, 12)}@apply.tidy.local`,
      service, preferred_language: lang, source: 'apply_v5',
    }).select('id').single();
    if (aErr || !a) return jsonResponse({ error: 'start_failed' }, 500);
    // A database trigger auto-creates the pipeline row at 'applied'; claim it with the resume token.
    const { error: pErr } = await admin.from('contractor_pipeline').update({
      service, preferred_language: lang, apply_resume_token: token, apply_started_at: new Date().toISOString(),
      invited_at: new Date().toISOString(), invite_deadline_at: new Date(Date.now() + 48 * 3600e3).toISOString(),
    }).eq('applicant_id', a.id);
    if (pErr) { await admin.from('applicants').delete().eq('id', a.id); return jsonResponse({ error: 'start_failed' }, 500); }
    await admin.rpc('hiring_set_deadline', { _id: a.id, _kind: 'apply', _due: new Date(Date.now() + 48 * 3600e3).toISOString(), _nudge: new Date(Date.now() + 24 * 3600e3).toISOString() });
    return jsonResponse({ ok: true, token });
  }

  const rec = await loadByToken(body?.token);
  if (!rec) return jsonResponse({ error: 'not_found' }, 404);
  const { p, a } = rec;
  const lang = p.preferred_language === 'es' ? 'es' : 'en';

  // ---- load: questions + saved answers + FAQ
  if (action === 'load') {
    const qs = await questionsFor(String(p.service));
    const { data: answers } = await admin.from('application_answers').select('question_id, value').eq('candidate_id', p.applicant_id);
    const faq = await faqFor(lang);
    return jsonResponse({
      ok: true, lang, service: p.service, stage: p.stage, submitted: !!p.apply_submitted_at,
      questions: qs.map((q) => ({
        id: q.id, key: q.key, section: q.section, type: q.type,
        label: lang === 'es' ? q.label_es : q.label_en,
        anchors: q.anchors_key, core: q.core, weight: q.weight, required: q.required,
        options: q.options, knockout: q.knockout, sort: q.sort,
      })),
      answers: Object.fromEntries((answers ?? []).map((r) => [r.question_id, r.value])),
      faq,
    });
  }

  // ---- answer: autosave one answer
  if (action === 'answer') {
    if (p.apply_submitted_at) return jsonResponse({ error: 'submitted' }, 409);
    const qid = String(body?.question_id ?? '');
    const { data: q } = await admin.from('question_bank').select('id, service').eq('id', qid).maybeSingle();
    if (!q || (q.service !== 'all' && q.service !== p.service)) return jsonResponse({ error: 'unknown_question' }, 400);
    const { error } = await admin.from('application_answers').upsert(
      { candidate_id: p.applicant_id, question_id: qid, value: body?.value ?? null, answered_at: new Date().toISOString() },
      { onConflict: 'candidate_id,question_id' });
    if (error) return jsonResponse({ error: 'save_failed' }, 500);
    return jsonResponse({ ok: true });
  }

  // ---- submit: required + knockout validation, stamp, mirror identity fields
  if (action === 'submit') {
    if (p.apply_submitted_at) return jsonResponse({ ok: true, already: true });
    const qs = await questionsFor(String(p.service));
    const { data: answers } = await admin.from('application_answers').select('question_id, value').eq('candidate_id', p.applicant_id);
    const byId = new Map((answers ?? []).map((r) => [r.question_id, r.value]));
    const missing: string[] = [];
    for (const q of qs) {
      if (!q.required) continue;
      if (q.type === 'slider') continue; // sliders stay unset until touched — never required
      const v = byId.get(q.id);
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) missing.push(q.key);
    }
    if (missing.length) return jsonResponse({ error: 'missing', keys: missing }, 400);
    const byKey = new Map(qs.map((q) => [q.key, q]));
    const val = (k: string) => { const q = byKey.get(k); return q ? byId.get(q.id) : undefined; };
    // Knockouts archive instantly with reason knockout_apply.
    const KO: Record<string, unknown> = {
      'qual.equipment': true, 'qual.vehicle': true, 'qual.authorized': true, 'qual.availability': true,
      'qual.location': true, 'qual.background': true, 'qual.contractor': true, 'qual.ready': true,
    };
    for (const [k, want] of Object.entries(KO)) {
      if (val(k) !== undefined && val(k) !== want) {
        await admin.rpc('pipeline_archive', { _id: p.applicant_id, _reason: 'knockout_apply' }).then(() => {}, () => {});
        // Fallback if the RPC name differs: direct guarded update.
        await admin.from('contractor_pipeline').update({ archived: true, archived_at: new Date().toISOString(), state: 'declined', archive_reason: 'knockout_apply', decline_reason: 'Knockout answer' }).eq('applicant_id', p.applicant_id);
        return jsonResponse({ ok: true, knockout: true });
      }
    }
    const secs = p.apply_started_at ? Math.max(0, Math.round((Date.now() - new Date(String(p.apply_started_at)).getTime()) / 1000)) : null;
    await admin.from('applicants').update({
      first_name: String(val('about.first_name') ?? ''), last_name: String(val('about.last_name') ?? ''),
      phone: String(val('about.phone') ?? ''), email: String(val('about.email') ?? a.email),
      zip: String(val('about.zip') ?? ''), preferred_language: lang,
    }).eq('id', p.applicant_id);
    await admin.from('contractor_pipeline').update({
      apply_submitted_at: new Date().toISOString(), apply_total_seconds: secs,
      ref_name: String(val('ref.name') ?? ''), ref_phone: String(val('ref.phone') ?? ''),
      ref_relationship: String(val('ref.relationship') ?? ''),
    }).eq('applicant_id', p.applicant_id);
    // Trigger pipeline_on_application_submitted advances invited → applied + sets proof deadline.
    return jsonResponse({ ok: true });
  }

  // ---- slots: open slots of a kind
  if (action === 'slots') {
    const kind = body?.kind === 'in_person' ? 'in_person' : 'phone';
    // In-person booking is blocked until Justin sets the private meeting location.
    if (kind === 'in_person') {
      const { data: loc } = await admin.from('app_settings').select('value').eq('key', 'hiring_inperson_location').maybeSingle();
      const locVal = typeof loc?.value === 'string' ? loc.value : '';
      if (!locVal.trim()) return jsonResponse({ ok: true, slots: [], location_missing: true });
    }
    const { data } = await admin.from('hiring_slots').select('id, starts_at, duration_min')
      .eq('kind', kind).eq('status', 'open').gt('starts_at', new Date().toISOString())
      .order('starts_at').limit(40);
    return jsonResponse({ ok: true, slots: data ?? [], current: kind === 'phone' ? p.phone_slot_id : p.inperson_slot_id });
  }

  // ---- book: claim a slot (one reschedule per kind)
  if (action === 'book') {
    const kind = body?.kind === 'in_person' ? 'in_person' : 'phone';
    const slotId = String(body?.slot_id ?? '');
    const col = kind === 'phone' ? 'phone_slot_id' : 'inperson_slot_id';
    const reschedCol = kind === 'phone' ? 'phone_reschedules' : 'inperson_reschedules';
    if (kind === 'phone' && p.stage !== 'proof') return jsonResponse({ error: 'wrong_stage' }, 409);
    if (kind === 'in_person' && !['phone_screened', 'referenced'].includes(String(p.stage))) return jsonResponse({ error: 'wrong_stage' }, 409);
    if (kind === 'in_person') {
      const { data: loc } = await admin.from('app_settings').select('value').eq('key', 'hiring_inperson_location').maybeSingle();
      const locVal = typeof loc?.value === 'string' ? loc.value : '';
      if (!locVal.trim()) return jsonResponse({ error: 'location_missing' }, 409);
    }
    if (p[col]) {
      if (Number(p[reschedCol] ?? 0) >= 1) return jsonResponse({ error: 'no_reschedules' }, 409);
      await admin.from('hiring_slots').update({ status: 'open', applicant_id: null, booked_at: null }).eq('id', p[col]);
      await admin.from('contractor_pipeline').update({ [reschedCol]: Number(p[reschedCol] ?? 0) + 1 }).eq('applicant_id', p.applicant_id);
    }
    const { data: slot, error } = await admin.from('hiring_slots')
      .update({ status: 'booked', applicant_id: p.applicant_id, booked_at: new Date().toISOString() })
      .eq('id', slotId).eq('status', 'open').gt('starts_at', new Date().toISOString()).select('id, starts_at').single();
    if (error || !slot) return jsonResponse({ error: 'slot_taken' }, 409);
    await admin.from('contractor_pipeline').update({ [col]: slotId }).eq('applicant_id', p.applicant_id);
    if (kind === 'phone') {
      await admin.rpc('hiring_resolve_deadline', { _id: p.applicant_id, _kind: 'book_phone' });
      await admin.rpc('hiring_set_deadline', { _id: p.applicant_id, _kind: 'phone_slot', _due: slot.starts_at, _nudge: null });
    } else {
      await admin.rpc('hiring_set_deadline', { _id: p.applicant_id, _kind: 'confirm_inperson', _due: new Date(Date.now() + 2 * 3600e3).toISOString(), _nudge: null });
      await admin.from('contractor_pipeline').update({ inperson_confirmed_at: null }).eq('applicant_id', p.applicant_id);
    }
    return jsonResponse({ ok: true, starts_at: slot.starts_at });
  }

  // ---- confirm: CONFIRM the in-person slot
  if (action === 'confirm') {
    if (!p.inperson_slot_id) return jsonResponse({ error: 'no_slot' }, 409);
    await admin.from('contractor_pipeline').update({ inperson_confirmed_at: new Date().toISOString() }).eq('applicant_id', p.applicant_id);
    await admin.rpc('hiring_resolve_deadline', { _id: p.applicant_id, _kind: 'confirm_inperson' });
    return jsonResponse({ ok: true });
  }

  // ---- checkin: weekly check-in reply
  if (action === 'checkin') {
    await admin.rpc('hiring_resolve_deadline', { _id: p.applicant_id, _kind: 'checkin' });
    return jsonResponse({ ok: true });
  }

  // ---- faq only
  if (action === 'faq') return jsonResponse({ ok: true, faq: await faqFor(lang) });

  return jsonResponse({ error: 'unknown_action' }, 400);
});
