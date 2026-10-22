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
import { weekdaysOnly } from '../_shared/hire-ready-rules.ts';
import { scoreV6, validV6Answer, validWorkReference, V6_DISQUALIFY_DELAY_MS, type V6Question } from '../_shared/application-v6.ts';

const backendUrl = Deno.env.get('SUPABASE_URL');
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!backendUrl || !serviceKey) throw new Error('Backend configuration missing');
const admin = createClient(backendUrl, serviceKey, { auth: { persistSession: false } });
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

async function questionsFor(service: string, p?: Pipeline) {
  let query = admin.from('question_bank').select('*').in('service', ['all', service]);
  if (Array.isArray(p?.apply_question_ids) && p.apply_question_ids.length) query = query.in('id', p.apply_question_ids);
  else query = query.eq('application_version', p?.application_version === 6 ? 6 : 5);
  const { data, error } = await query.order('section').order('sort');
  if (error) throw new Error('question_load_failed');
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


// Equipment proof link: issued the moment the application is submitted so the
// candidate can upload right away (and resume later from the same link).
async function ensureProofUrl(p: Record<string, unknown>): Promise<string | null> {
  if (p.archived || !p.apply_submitted_at && !p.__submitting) return null;
  if (!['applied', 'proof'].includes(String(p.stage)) && !p.__submitting) return null;
  if (p.proof_approved_at) return null;
  let tok = p.proof_token as string | null;
  const exp = p.proof_token_expires_at ? new Date(String(p.proof_token_expires_at)).getTime() : 0;
  if (!tok || exp < Date.now()) {
    tok = tok ?? Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');
    await admin.from('contractor_pipeline').update({ proof_token: tok, proof_token_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString(), proof_link_sent_at: new Date().toISOString() }).eq('applicant_id', p.applicant_id);
  }
  return `https://jointidy.co/pro/proof/${tok}`;
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
    const initialQuestions = await questionsFor(service, { applicant_id: '', application_version: 6 });
    if (!initialQuestions.length) return jsonResponse({ error: 'questions_unavailable' }, 503);
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const { data: a, error: aErr } = await admin.from('applicants').insert({
      first_name: '', last_name: '', phone: '', email: `pending-${token.slice(0, 12)}@apply.tidy.local`,
      service, preferred_language: lang, source: 'apply_v5',
    }).select('id').single();
    if (aErr || !a) return jsonResponse({ error: 'start_failed' }, 500);
    // A database trigger auto-creates the pipeline row at 'applied'; claim it with the resume token.
    const { error: pErr } = await admin.from('contractor_pipeline').update({
      service, preferred_language: lang, application_version: 6, apply_question_ids: initialQuestions.map(q => q.id), apply_resume_token: token, apply_started_at: new Date().toISOString(),
      invited_at: new Date().toISOString(), invite_deadline_at: new Date(Date.now() + 48 * 3600e3).toISOString(),
    }).eq('applicant_id', a.id);
    if (pErr) { await admin.from('applicants').delete().eq('id', a.id); return jsonResponse({ error: 'start_failed' }, 500); }
    const { data: sprint } = await admin.rpc('hiring_sprint_active');
    const hours = sprint ? 24 : 48;
    await admin.from('contractor_pipeline').update({ invite_deadline_at: new Date(Date.now() + hours * 3600e3).toISOString() }).eq('applicant_id', a.id);
    await admin.rpc('hiring_set_deadline', { _id: a.id, _kind: 'apply', _due: new Date(Date.now() + hours * 3600e3).toISOString(), _nudge: new Date(Date.now() + (hours / 2) * 3600e3).toISOString() });
    return jsonResponse({ ok: true, token });
  }

  const rec = await loadByToken(body?.token);
  if (!rec) return jsonResponse({ error: 'not_found' }, 404);
  const { p, a } = rec;
  const lang = body?.lang === 'es' ? 'es' : body?.lang === 'en' ? 'en' : p.preferred_language === 'es' ? 'es' : 'en';
  if (lang !== p.preferred_language) await admin.from('contractor_pipeline').update({ preferred_language: lang }).eq('applicant_id', p.applicant_id);
  const { data: campaignJob } = await admin.from('hire_ready_invite_jobs').select('id').eq('applicant_id', p.applicant_id).eq('kind', 'invite').maybeSingle();
  const hireReady = !!campaignJob;
  const immediatePhone = hireReady || p.application_version === 6;

  // ---- load: questions + saved answers + FAQ
  if (action === 'load') {
    const qs = await questionsFor(String(p.service), p);
    if (!qs.length) return jsonResponse({ error: 'questions_unavailable' }, 503);
    const { data: answers } = await admin.from('application_answers').select('question_id, value').eq('candidate_id', p.applicant_id);
    const faq = await faqFor(lang);
    return jsonResponse({
      ok: true, lang, service: p.service, stage: p.stage, version: p.application_version ?? 5, submitted: !!p.apply_submitted_at,
      phone_screen_after_submit: immediatePhone && !!p.apply_submitted_at && !p.archived,
      phone_duration_min: hireReady || p.application_version === 6 ? 30 : undefined,
      proof_url: p.apply_submitted_at ? await ensureProofUrl(p) : null,
      reference: p.application_version === 6 && ['phone_screened', 'referenced'].includes(String(p.stage)) ? { name: p.ref_name, phone: p.ref_phone, relationship: p.ref_relationship } : undefined,
      questions: qs.map((q) => ({
        id: q.id, key: q.key, section: q.section, type: q.type,
        label: lang === 'es' ? q.label_es : q.label_en,
        label_en: q.label_en, label_es: q.label_es,
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
    const qs = await questionsFor(String(p.service), p);
    const q = qs.find(q => q.id === qid);
    if (!q) return jsonResponse({ error: 'unknown_question' }, 400);
    if (p.application_version === 6 && !validV6Answer(q as V6Question, body.value) && body.value !== null && body.value !== '' && q.type !== 'grid' && q.type !== 'text' && q.type !== 'multi') return jsonResponse({ error: 'invalid_answer' }, 400);
    const { error } = await admin.from('application_answers').upsert(
      { candidate_id: p.applicant_id, question_id: qid, value: body?.value ?? null, answered_at: new Date().toISOString() },
      { onConflict: 'candidate_id,question_id' });
    if (error) return jsonResponse({ error: 'save_failed' }, 500);
    return jsonResponse({ ok: true });
  }

  // ---- submit: required + knockout validation, stamp, mirror identity fields
  if (action === 'submit') {
    if (p.apply_submitted_at) return jsonResponse({ ok: true, already: true, proof_url: await ensureProofUrl(p) });
    const qs = await questionsFor(String(p.service), p);
    if (!qs.length) return jsonResponse({ error: 'questions_unavailable' }, 503);
    const { data: answers } = await admin.from('application_answers').select('question_id, value').eq('candidate_id', p.applicant_id);
    const byId = new Map((answers ?? []).map((r) => [r.question_id, r.value]));
    const missing: string[] = [];
    for (const q of qs) {
      if (!q.required) continue;
      if (p.application_version !== 6 && q.type === 'slider') continue;
      const v = byId.get(q.id);
      if (p.application_version === 6 ? !validV6Answer(q as V6Question, v) : v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) missing.push(q.key);
    }
    if (missing.length) return jsonResponse({ error: 'missing', keys: missing }, 400);
    const byKey = new Map(qs.map((q) => [q.key, q]));
    const val = (k: string) => { const q = byKey.get(k); return q ? byId.get(q.id) : undefined; };
    // Knockouts archive instantly with reason knockout_apply.
    const KO: Record<string, unknown> = {
      'qual.equipment': true, 'qual.vehicle': true, 'qual.authorized': true, 'qual.availability': true,
      'qual.location': true, 'qual.background': true, 'qual.contractor': true, 'qual.ready': true,
    };
    for (const [k, want] of Object.entries(p.application_version === 6 ? {} : KO)) {
      if (val(k) !== undefined && val(k) !== want) {
        await admin.rpc('pipeline_archive', { _id: p.applicant_id, _reason: 'knockout_apply' }).then(() => {}, () => {});
        // Fallback if the RPC name differs: direct guarded update.
        await admin.from('contractor_pipeline').update({ archived: true, archived_at: new Date().toISOString(), state: 'declined', archive_reason: 'knockout_apply', decline_reason: 'Knockout answer' }).eq('applicant_id', p.applicant_id);
        return jsonResponse({ ok: true, knockout: true });
      }
    }
    const secs = p.apply_started_at ? Math.max(0, Math.round((Date.now() - new Date(String(p.apply_started_at)).getTime()) / 1000)) : null;
    const prefix = p.application_version === 6 ? 'v6.' : '';
    let report: ReturnType<typeof scoreV6> | null = null;
    if (p.application_version === 6) {
      const { data: lc } = await admin.from('launch_config').select('est_full_day_pay').eq('scope', p.service === 'car_care' ? 'car' : p.service).maybeSingle();
      report = scoreV6(qs as V6Question[], byId, String(p.service), lang, lc?.est_full_day_pay ?? null);
    }
    const { error: identityError } = await admin.from('applicants').update({
      first_name: String(val(`${prefix}about.first_name`) ?? ''), last_name: String(val(`${prefix}about.last_name`) ?? ''),
      phone: String(val(`${prefix}about.phone`) ?? ''), email: String(val(`${prefix}about.email`) ?? a.email),
      zip: String(val(`${prefix}about.zip`) ?? ''), preferred_language: lang,
      ...(report ? { drive_minutes: report.drive_time_minutes, drivers_license: String(val('v6.licence') ?? '') } : {}),
    }).eq('id', p.applicant_id);
    if (identityError) return jsonResponse({ error: 'submit_failed' }, 500);
    const { error: submitError } = await admin.from('contractor_pipeline').update({
      apply_submitted_at: new Date().toISOString(), apply_total_seconds: secs,
      ...(report ? { application_report: report, application_disqualify_at: report.disqualified ? new Date(Date.now()+V6_DISQUALIFY_DELAY_MS).toISOString() : null } : { ref_name: String(val('ref.name') ?? ''), ref_phone: String(val('ref.phone') ?? ''), ref_relationship: String(val('ref.relationship') ?? '') }),
    }).eq('applicant_id', p.applicant_id);
    if (submitError) return jsonResponse({ error: 'submit_failed' }, 500);
    if (report?.disqualified) await admin.from('hiring_deadlines').update({ resolved_at: new Date().toISOString() }).eq('applicant_id', p.applicant_id).is('resolved_at', null);
    // Trigger pipeline_on_application_submitted advances invited → applied + sets proof deadline.
    const proof_url = await ensureProofUrl({ ...p, __submitting: true });
    return jsonResponse({ ok: true, proof_url, phone_screen_after_submit: immediatePhone, phone_duration_min: immediatePhone ? 30 : undefined });
  }

  // ---- slots: open slots of a kind
  if (action === 'slots') {
    const kind = body?.kind === 'in_person' ? 'in_person' : 'phone';
    if (immediatePhone && (p.archived || !p.apply_submitted_at)) return jsonResponse({ error: 'submit_application_first' }, 409);
    if (hireReady && kind === 'in_person' && Date.now() < Date.parse('2026-10-26T04:00:00Z')) return jsonResponse({ ok: true, slots: [] });
    // In-person booking is blocked until Justin sets the private meeting location.
    if (kind === 'in_person') {
      const { data: loc } = await admin.from('app_settings').select('value').eq('key', 'hiring_inperson_location').maybeSingle();
      const locVal = typeof loc?.value === 'string' ? loc.value : '';
      if (!locVal.trim()) return jsonResponse({ ok: true, slots: [], location_missing: true });
    }
    const { data } = await admin.from('hiring_slots').select('id, starts_at, duration_min')
      .eq('kind', kind).eq('status', 'open').gt('starts_at', new Date().toISOString())
      .order('starts_at').limit(40);
    const slots = immediatePhone && kind === 'phone' ? (data ?? []).filter(s => s.duration_min === 30 && weekdaysOnly(s.starts_at)) : data ?? [];
    return jsonResponse({ ok: true, slots, current: kind === 'phone' ? p.phone_slot_id : p.inperson_slot_id });
  }

  // ---- book: claim a slot (one reschedule per kind)
  if (action === 'book') {
    const kind = body?.kind === 'in_person' ? 'in_person' : 'phone';
    const slotId = String(body?.slot_id ?? '');
    const col = kind === 'phone' ? 'phone_slot_id' : 'inperson_slot_id';
    const reschedCol = kind === 'phone' ? 'phone_reschedules' : 'inperson_reschedules';
    if (p.archived) return jsonResponse({ error: 'archived' }, 409);
    if (immediatePhone && !p.apply_submitted_at) return jsonResponse({ error: 'submit_application_first' }, 409);
    if (kind === 'phone' && p.stage !== 'proof' && !(immediatePhone && p.apply_submitted_at && ['applied', 'screen_booked'].includes(String(p.stage)))) return jsonResponse({ error: 'wrong_stage' }, 409);
    if (hireReady && kind === 'in_person' && Date.now() < Date.parse('2026-10-26T04:00:00Z')) return jsonResponse({ error: 'no_in_person_this_week' }, 409);
    const { data: chosen } = await admin.from('hiring_slots').select('kind,starts_at,duration_min').eq('id', slotId).maybeSingle();
    if (!chosen || chosen.kind !== kind || (immediatePhone && kind === 'phone' && (chosen.duration_min !== 30 || !weekdaysOnly(chosen.starts_at)))) return jsonResponse({ error: 'invalid_slot' }, 400);
    if (kind === 'in_person' && !['phone_screened', 'referenced'].includes(String(p.stage))) return jsonResponse({ error: 'wrong_stage' }, 409);
    if (kind === 'in_person' && p.application_version === 6) {
      const reference = body?.reference;
      const name = String(reference?.name ?? p.ref_name ?? '').trim();
      const phone = String(reference?.phone ?? p.ref_phone ?? '').trim();
      const relationship = String(reference?.relationship ?? p.ref_relationship ?? '').trim();
      if (!validWorkReference(name, phone, relationship)) return jsonResponse({ error: 'reference_required' }, 400);
      const { error } = await admin.from('contractor_pipeline').update({ ref_name: name, ref_phone: phone, ref_relationship: relationship }).eq('applicant_id', p.applicant_id);
      if (error) return jsonResponse({ error: 'reference_save_failed' }, 500);
    }
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
