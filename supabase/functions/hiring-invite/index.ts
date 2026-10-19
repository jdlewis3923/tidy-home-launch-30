import '../_shared/http.ts';
/**
 * hiring-invite — admin-only. Paste rows (first name, phone, service, language,
 * source) and each person gets a tokenized /apply link by text.
 *
 * Dedupe by phone: a live record gets a resend with a fresh deadline; an
 * archived record is reopened ONCE back to invited. Sprint mode
 * (app_settings.hiring_sprint_mode) shortens the deadline 48h -> 24h with the
 * nudge at 12h.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
const SITE = 'https://jointidy.co';

type Lang = 'en' | 'es';
const SERVICE_MAP: Record<string, string> = {
  cleaning: 'cleaning', limpieza: 'cleaning',
  lawn: 'lawn', césped: 'lawn', cesped: 'lawn',
  car: 'car_care', car_care: 'car_care', 'car care': 'car_care', auto: 'car_care',
};
const ROLE: Record<string, { en: string; es: string }> = {
  cleaning: { en: 'house cleaning', es: 'limpieza de casas' },
  lawn: { en: 'lawn care', es: 'cuidado de césped' },
  car_care: { en: 'car care', es: 'cuidado de autos' },
};

const digits = (s: string) => (s ?? '').replace(/\D/g, '');
const e164 = (raw: string) => {
  const d = digits(raw);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
};
const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('');

function deadlineLabel(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return d.toLocaleString(lang === 'es' ? 'es-US' : 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function inviteText(first: string, service: string, lang: Lang, link: string, deadline: string): string {
  const role = ROLE[service] ?? ROLE.cleaning;
  return lang === 'es'
    ? `Hola ${first}, aplicaste en Indeed para el puesto de ${role.es} de Tidy. Soy Justin de Tidy Home Concierge. El siguiente paso es nuestra solicitud (unos 20 minutos, se guarda mientras avanzas): ${link}. Después subirás fotos de tu equipo y elegirás la hora de una llamada. El enlace cierra: ${deadline}.`
    : `Hi ${first}, you applied on Indeed for Tidy's ${role.en} opening. It's Justin from Tidy Home Concierge. Next step is our application (about 20 min, saves as you go): ${link}. Then you'll upload equipment photos and pick a time for a phone call. Link closes ${deadline}.`;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const { rows } = await req.json().catch(() => ({}));
  if (!Array.isArray(rows) || rows.length === 0) return jsonResponse({ error: 'rows required' }, 400);
  if (rows.length > 100) return jsonResponse({ error: 'max 100 rows' }, 400);

  const { data: sprint } = await admin.rpc('hiring_sprint_active');
  const hours = sprint ? 24 : 48;
  const nudgeHours = sprint ? 12 : 24;

  const { data: all } = await admin.from('applicants').select('id, first_name, phone, service, source, preferred_language').not('phone', 'is', null);
  const byPhone = new Map<string, typeof all extends (infer T)[] | null ? T : never>();
  for (const a of all ?? []) {
    const d = digits(a.phone ?? '');
    if (d.length >= 10) byPhone.set(d.slice(-10), a);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const raw of rows) {
    const first = String(raw?.first_name ?? '').trim().split(/\s+/)[0] || '';
    const phone = e164(String(raw?.phone ?? ''));
    const service = SERVICE_MAP[String(raw?.service ?? '').trim().toLowerCase()] ?? null;
    const lang: Lang = String(raw?.language ?? '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
    const source = String(raw?.source ?? 'indeed').trim().toLowerCase() || 'indeed';
    if (!first || !phone || !service) {
      results.push({ first, phone: raw?.phone ?? null, status: 'error', error: 'need first name, valid phone, and service (cleaning/lawn/car)' });
      continue;
    }

    const key = digits(phone).slice(-10);
    const existing = byPhone.get(key);
    let applicantId: string;
    let action: 'created' | 'resent' | 'reopened';

    if (!existing) {
      const { data: ins, error } = await admin.from('applicants').insert({
        first_name: first, phone, service, source,
        preferred_language: lang, current_stage: 'invited', queue_state: 'texted',
        first_texted_at: new Date().toISOString(),
      }).select('id').single();
      if (error || !ins) { results.push({ first, phone, status: 'error', error: error?.message ?? 'insert failed' }); continue; }
      applicantId = ins.id;
      action = 'created';
    } else {
      applicantId = (existing as { id: string }).id;
      const { data: p } = await admin.from('contractor_pipeline').select('archived, apply_resume_token').eq('applicant_id', applicantId).maybeSingle();
      if (p?.archived) {
        const { error } = await admin.rpc('hiring_reopen', { _applicant_id: applicantId });
        if (error) { results.push({ first, phone, status: 'error', error: `reopen: ${error.message}` }); continue; }
        action = 'reopened';
      } else {
        action = 'resent';
      }
      await admin.from('applicants').update({
        first_texted_at: new Date().toISOString(), queue_state: 'texted',
        preferred_language: lang, service, source,
      }).eq('id', applicantId);
    }

    // Fresh token + deadline on every invite/resend/reopen.
    const token = newToken();
    const due = new Date(Date.now() + hours * 3600_000);
    const nudge = new Date(Date.now() + nudgeHours * 3600_000);
    const { error: pErr } = await admin.from('contractor_pipeline').update({
      apply_resume_token: token, invite_deadline_at: due.toISOString(),
    }).eq('applicant_id', applicantId);
    if (pErr) { results.push({ first, phone, status: 'error', error: pErr.message }); continue; }
    await admin.rpc('hiring_set_deadline', { _id: applicantId, _kind: 'apply', _due: due.toISOString(), _nudge: nudge.toISOString() });

    const link = `${SITE}/apply?resume=${token}`;
    const body = inviteText(first, service, lang, link, deadlineLabel(due.toISOString(), lang));
    let sms: string = 'failed';
    try {
      const r = await vendorFetch(`${URL_}/functions/v1/send-twilio-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({
          to_phone_e164: phone, body,
          idempotency_key: `invite:${applicantId}:${new Date().toISOString().slice(0, 13)}`,
          template_name: 'hiring_invite', triggered_by: 'hiring-invite',
        }),
      });
      const payload = await r.json().catch(() => ({}));
      sms = r.ok && payload.ok ? (payload.queued ? 'queued' : 'sent') : `failed_${r.status}:${String(payload.error ?? '').slice(0, 120)}`;
    } catch (e) {
      sms = `failed:${(e as Error).message.slice(0, 120)}`;
    }

    await admin.from('contractor_stage_events').insert({
      applicant_id: applicantId, kind: 'message', from_stage: 'invited', to_stage: 'invited',
      reason: `invite ${action} (${lang})`, metadata: { action, lang, sms, deadline: due.toISOString() },
    }).then(() => null, () => null);

    results.push({ first, phone, service, lang, status: action, sms, deadline: due.toISOString(), applicant_id: applicantId });
  }

  return jsonResponse({ ok: true, sprint: !!sprint, deadline_hours: hours, results });
});
