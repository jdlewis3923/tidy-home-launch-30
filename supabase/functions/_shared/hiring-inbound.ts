// HIRING v5 — inbound SMS keyword handling for pipeline candidates.
// Shared by twilio-inbound-sms (live) and hiring-sms-simulate (dry-run testing).
// Returns true when the sender matched a candidate and the text was handled
// (including "logged as unread reply"); false when the number is unknown.

import { vendorFetch } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizeKeyword(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

async function sendSms(to: string, body: string, key: string, template: string) {
  await vendorFetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_phone_e164: to, body, idempotency_key: key, template_name: template, triggered_by: 'hiring-inbound' }),
  }).catch((e) => console.error('[hiring-inbound] send failed', e));
}

// deno-lint-ignore no-explicit-any
async function logTimeline(admin: any, applicantId: string, note: string, meta: Record<string, unknown> = {}) {
  await admin.from('contractor_stage_events').insert({
    applicant_id: applicantId, event: 'note', note, meta,
  }).then(() => {}, (e: unknown) => console.error('[hiring-inbound] timeline log failed', e));
}

// deno-lint-ignore no-explicit-any
export async function handleHiringInbound(admin: any, fromRaw: string, body: string, messageSid: string | null): Promise<boolean> {
  const from = normalizePhone(fromRaw);

  // Match sender to a candidate (live or archived).
  const { data: applicant } = await admin
    .from('applicants')
    .select('id, first_name, preferred_language')
    .or(`phone.eq.${from},phone.eq.${from.replace('+1', '')},phone.eq.${from.slice(1)}`)
    .limit(1)
    .maybeSingle();

  if (!applicant) {
    await admin.from('unmatched_texts').insert({ from_phone: from, body, twilio_sid: messageSid });
    return false;
  }

  const { data: p } = await admin
    .from('contractor_pipeline')
    .select('*')
    .eq('applicant_id', applicant.id)
    .maybeSingle();
  if (!p) return false;

  const lang = p.preferred_language === 'es' ? 'es' : 'en';
  const first = applicant.first_name || (lang === 'es' ? 'Hola' : 'there');
  const kw = normalizeKeyword(body);

  const t = (en: string, es: string) => (lang === 'es' ? es : en);

  // ---- YES: revive an archived-for-silence candidate ONCE within 7 days ----
  if (kw === 'YES') {
    const silenceReasons = ['no_apply', 'no_proof', 'no_booking', 'no_show_phone', 'no_confirm', 'no_show_interview', 'no_sign', 'no_bg_consent', 'no_coi'];
    const archivedRecently = p.archived && p.archived_at && (Date.now() - new Date(p.archived_at).getTime()) < 7 * 24 * 3600e3;
    if (p.archived && archivedRecently && silenceReasons.includes(p.archive_reason) && !p.revived_once && p.archived_from_stage) {
      await admin.rpc('pipeline_restore', { _id: applicant.id }).catch(() => {});
      // Direct restore: pipeline_restore may not exist; use guarded update path.
      const { error } = await admin
        .from('contractor_pipeline')
        .update({
          archived: false, archived_at: null, state: 'open',
          stage: p.archived_from_stage, archive_reason: null, decline_reason: null,
          revived_once: true,
        })
        .eq('applicant_id', applicant.id)
        .eq('archived', true);
      if (error) {
        console.error('[hiring-inbound] revive blocked', error.message);
      } else {
        await admin.rpc('hiring_set_deadline', {
          _id: applicant.id,
          _kind: p.archived_from_stage === 'applied' ? 'proof' : p.archived_from_stage,
          _due: new Date(Date.now() + 48 * 3600e3).toISOString(),
          _nudge: new Date(Date.now() + 24 * 3600e3).toISOString(),
        }).catch(() => {});
        await logTimeline(admin, applicant.id, 'Revived by YES reply', { from_stage: p.archived_from_stage });
        await sendSms(from, t(
          `Welcome back, ${first}! You're back in the running. Check your texts for the next step — you have 48 hours. — Tidy`,
          `¡Bienvenido de nuevo, ${first}! Sigues en el proceso. Revisa tus mensajes para el siguiente paso — tienes 48 horas. — Tidy`,
        ), `revive-${applicant.id}-${Date.now()}`, 'hiring-revive');
      }
      return true;
    }
    // YES with nothing to revive → fall through to unread-reply logging.
  }

  // ---- C / CONFIRM: confirm the next booked slot ----
  if (kw === 'C' || kw === 'CONFIRM') {
    const { data: slot } = await admin
      .from('hiring_slots')
      .select('id, kind, starts_at, confirmed_at')
      .eq('applicant_id', applicant.id)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (slot) {
      await admin.from('hiring_slots').update({ confirmed_at: new Date().toISOString() }).eq('id', slot.id);
      if (slot.kind === 'phone') {
        await admin.from('contractor_pipeline').update({ phone_confirmed_at: new Date().toISOString() }).eq('applicant_id', applicant.id);
      } else {
        await admin.from('contractor_pipeline').update({ inperson_confirmed_at: new Date().toISOString() }).eq('applicant_id', applicant.id);
        await admin.rpc('hiring_resolve_deadline', { _id: applicant.id, _kind: 'confirm_inperson' }).catch(() => {});
      }
      await logTimeline(admin, applicant.id, `Confirmed ${slot.kind} slot by text`, { slot_id: slot.id });
      await sendSms(from, t(
        `Confirmed, ${first}! See you ${new Date(slot.starts_at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' })}. — Tidy`,
        `¡Confirmado, ${first}! Nos vemos ${new Date(slot.starts_at).toLocaleString('es-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit' })}. — Tidy`,
      ), `confirm-${slot.id}`, 'hiring-confirm');
    }
    return true;
  }

  // ---- R: release the slot and send the booking link (one reschedule) ----
  if (kw === 'R') {
    const { data: slot } = await admin
      .from('hiring_slots')
      .select('id, kind')
      .eq('applicant_id', applicant.id)
      .eq('status', 'booked')
      .gt('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (slot) {
      const col = slot.kind === 'phone' ? 'phone_reschedules' : 'inperson_reschedules';
      const used = (p[col] ?? 0) as number;
      await admin.from('hiring_slots').update({ status: 'open', applicant_id: null, booked_at: null, confirmed_at: null }).eq('id', slot.id);
      if (used >= 1) {
        // Second R = archive.
        await admin.from('contractor_pipeline').update({
          archived: true, archived_at: new Date().toISOString(), state: 'declined',
          archived_from_stage: p.stage, archive_reason: 'reschedule_twice', decline_reason: 'Rescheduled twice',
        }).eq('applicant_id', applicant.id);
        await logTimeline(admin, applicant.id, 'Archived: rescheduled twice', {});
        await sendSms(from, t(
          `${first}, we've released your spot. If things change, you're welcome to reapply later. — Tidy`,
          `${first}, liberamos tu espacio. Si algo cambia, puedes volver a aplicar más adelante. — Tidy`,
        ), `r-archive-${applicant.id}-${Date.now()}`, 'hiring-close-out');
      } else {
        await admin.from('contractor_pipeline').update({ [col]: used + 1 }).eq('applicant_id', applicant.id);
        const link = `https://jointidy.co/pro/book/${p.apply_resume_token}`;
        await logTimeline(admin, applicant.id, `Released ${slot.kind} slot (reschedule ${used + 1}/1)`, {});
        await sendSms(from, t(
          `No problem, ${first}. Pick a new time here (one reschedule): ${link} — Tidy`,
          `Sin problema, ${first}. Elige una nueva hora aquí (un solo cambio): ${link} — Tidy`,
        ), `r-rebook-${applicant.id}-${Date.now()}`, 'hiring-rebook');
      }
    }
    return true;
  }

  // ---- 1: weekly check-in "on track" ----
  if (kw === '1') {
    await admin.rpc('hiring_resolve_deadline', { _id: applicant.id, _kind: 'checkin' }).catch(() => {});
    await admin.from('contractor_pipeline').update({ checkin_missed_count: 0 }).eq('applicant_id', applicant.id);
    await logTimeline(admin, applicant.id, 'Weekly check-in: on track', {});
    await sendSms(from, t(`Thanks, ${first}! Glad you're on track. — Tidy`, `¡Gracias, ${first}! Nos alegra que todo vaya bien. — Tidy`), `checkin-ok-${applicant.id}-${Date.now()}`, 'hiring-checkin-ok');
    return true;
  }

  // ---- 2: needs help → URGENT alert ----
  if (kw === '2') {
    await admin.rpc('hiring_resolve_deadline', { _id: applicant.id, _kind: 'checkin' }).catch(() => {});
    await admin.from('admin_alerts').insert({
      alert_type: 'hiring_needs_help', level: 'critical', category: 'hiring',
      title: `${first} needs help`,
      body: `${first} replied "2" to the weekly check-in. Call or text them today.`,
      action_label: 'Open candidate', action_url: `/admin/pipeline/${applicant.id}`,
      dedupe_key: `needs_help:${applicant.id}:${new Date().toISOString().slice(0, 10)}`,
      context: { applicant_id: applicant.id },
    }).then(() => {}, () => {});
    await logTimeline(admin, applicant.id, 'Weekly check-in: needs help', {});
    await sendSms(from, t(`Thanks for telling us, ${first}. Justin will reach out today. — Tidy`, `Gracias por avisarnos, ${first}. Justin te contactará hoy. — Tidy`), `checkin-help-${applicant.id}-${Date.now()}`, 'hiring-checkin-help');
    return true;
  }

  // ---- STOP / START: carrier-level opt-out is never overridden; just log ----
  if (kw === 'STOP' || kw === 'START' || kw === 'UNSTOP') {
    await logTimeline(admin, applicant.id, `Opt-out keyword received: ${kw}`, {});
    return true;
  }

  // ---- Anything else: timeline + 9 AM digest "Unread reply" ----
  await logTimeline(admin, applicant.id, `Unread reply: ${body.slice(0, 300)}`, { twilio_sid: messageSid });
  await admin.from('admin_alerts').insert({
    alert_type: 'hiring_unread_reply', level: 'action', category: 'hiring',
    title: `Unread reply from ${first}`,
    body: body.slice(0, 300),
    action_label: 'Open candidate', action_url: `/admin/pipeline/${applicant.id}`,
    context: { applicant_id: applicant.id, twilio_sid: messageSid },
  }).then(() => {}, () => {});
  return true;
}
