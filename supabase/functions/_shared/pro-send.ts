/**
 * THE SEND DOOR for Pro/applicant email.
 *
 * Every Pro email is built elsewhere and leaves through sendProEmail. For keys
 * in the sequence inventory (onboarding-sequence.ts) the door enforces:
 *   - order: an email cannot send before the one ahead of it
 *   - send once (or its allowed repeat count)
 *   - automated mail only: one per person per 48 hours, and quiet hours
 *     (8 AM–8 PM Eastern) — held mail is queued, not dropped
 * Blocked, deferred and out-of-sequence sends are written to onboarding_events
 * and the Workday feed. Every attempt is logged to email_send_log.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendBrevoEmail, type BrevoAttachment } from './brevo-send.ts';
import type { Built } from './pro-emails.ts';
import { SEQUENCE_EMAILS, AUTO_CAP_MS, inQuietHours, nextSendWindow } from './onboarding-sequence.ts';

/** transition = fired by a stage change; auto = system; manual = admin Send menu override. */
export type SendMode = 'transition' | 'auto' | 'manual';

/** Legacy event names that count as the sequence email. */
const ALIASES: Record<string, string[]> = { onboarding: ['welcome'], missing: ['reminder'] };

export type GuardResult =
  | { ok: true; outOfSequence: string | null }
  | { ok: false; blocked: string }
  | { ok: false; deferred: string; dueAt: string };

async function workday(admin: SupabaseClient, applicantId: string, type: string, title: string, detail: string, status: string, meta: Record<string, unknown>) {
  await admin.from('admin_workday_events').insert({
    event_type: type, applicant_id: applicantId, actor_type: 'system', title, detail, status,
    waiting_on_admin: status === 'blocked', metadata: meta,
  }).then(() => null, () => null);
}

export async function sequenceGuard(admin: SupabaseClient, applicantId: string, key: string, mode: SendMode, now = new Date()): Promise<GuardResult> {
  const def = SEQUENCE_EMAILS[key];
  if (!def) return { ok: true, outOfSequence: null };

  const { data: evs } = await admin.from('onboarding_events')
    .select('event, created_at, metadata').eq('applicant_id', applicantId).like('event', 'email_sent:%');
  const { data: a } = await admin.from('applicants')
    .select('first_name, onboarding_email_sent_at, contract_sent_at').eq('id', applicantId).maybeSingle();
  const rows = (evs ?? []) as { event: string; created_at: string; metadata: Record<string, unknown> | null }[];
  const count = (k: string) => rows.filter((r) => [k, ...(ALIASES[k] ?? [])].includes(r.event.slice('email_sent:'.length))).length
    + (k === 'onboarding' && a?.onboarding_email_sent_at && !rows.some((r) => ['email_sent:onboarding', 'email_sent:welcome'].includes(r.event)) ? 1 : 0)
    + (k === 'contract' && a?.contract_sent_at && !rows.some((r) => r.event === 'email_sent:contract') ? 1 : 0);

  let violation: string | null = null;
  if (def.after && count(def.after) === 0) violation = `out of order — "${SEQUENCE_EMAILS[def.after]?.label ?? def.after}" (#${SEQUENCE_EMAILS[def.after]?.order}) has not been sent`;
  else if (count(key) >= (def.repeat ?? 1)) violation = `duplicate — already sent ${count(key)} time(s)`;

  const name = a?.first_name ?? 'Pro';
  if (violation) {
    if (mode === 'manual') return { ok: true, outOfSequence: violation };
    await admin.from('onboarding_events').insert({ applicant_id: applicantId, event: `email_blocked:${key}`, metadata: { reason: violation, mode, order: def.order } });
    await workday(admin, applicantId, 'email_blocked', `Blocked: ${def.label} to ${name}`, violation, 'blocked', { key, mode, order: def.order });
    return { ok: false, blocked: violation };
  }

  if (mode === 'auto') {
    let due: Date | null = null; let reason = '';
    const lastAuto = rows.filter((r) => r.metadata?.auto === true).map((r) => new Date(r.created_at).getTime()).sort((x, y) => y - x)[0];
    if (lastAuto && now.getTime() - lastAuto < AUTO_CAP_MS) { due = new Date(lastAuto + AUTO_CAP_MS); reason = '48-hour cap'; }
    const candidate = due ?? now;
    if (inQuietHours(candidate)) { due = nextSendWindow(candidate); reason = reason ? `${reason} + quiet hours` : 'quiet hours (8 AM–8 PM ET)'; }
    if (due) {
      await admin.from('sequence_email_queue').upsert(
        { applicant_id: applicantId, email_key: key, due_at: due.toISOString(), reason },
        { onConflict: 'applicant_id,email_key', ignoreDuplicates: true },
      ).then(() => null, () => null);
      await admin.from('onboarding_events').insert({ applicant_id: applicantId, event: `email_deferred:${key}`, metadata: { reason, due_at: due.toISOString() } });
      await workday(admin, applicantId, 'email_deferred', `Held: ${def.label} to ${name}`, `${reason} — goes out ${due.toISOString()}`, 'info', { key, due_at: due.toISOString() });
      return { ok: false, deferred: reason, dueAt: due.toISOString() };
    }
  }
  return { ok: true, outOfSequence: null };
}

export async function sendProEmail(admin: SupabaseClient, args: {
  applicantId: string | null;
  key: string;
  to: string;
  name?: string;
  built: Built;
  triggeredBy: string;
  attachment?: BrevoAttachment[];
  /** Defaults to 'transition'. Receipts/owner copies (not in the inventory) are unguarded. */
  mode?: SendMode;
}): Promise<{ sent: boolean; reason?: string; blocked?: boolean; deferred?: boolean; outOfSequence?: string | null }> {
  const mode = args.mode ?? 'transition';
  let outOfSequence: string | null = null;
  if (args.applicantId) {
    const g = await sequenceGuard(admin, args.applicantId, args.key, mode);
    if (!g.ok && 'blocked' in g) return { sent: false, blocked: true, reason: g.blocked };
    if (!g.ok && 'deferred' in g) return { sent: false, deferred: true, reason: `${g.deferred}; queued for ${g.dueAt}` };
    if (g.ok) outOfSequence = g.outOfSequence;
  }
  const def = SEQUENCE_EMAILS[args.key];
  const res = await sendBrevoEmail({
    to: [{ email: args.to, name: args.name }],
    marketing: false,
    subject: args.built.subject,
    htmlContent: args.built.html,
    sender: { name: 'Tidy Home Concierge', email: 'hello@jointidy.co' },
    tags: ['pro', args.key],
    attachment: args.attachment,
    label: `pro-email:${args.key}`,
  });
  await admin.from('email_send_log').insert({
    template_name: `pro:${args.key}`,
    channel: 'email',
    recipient: args.to,
    triggered_by: args.triggeredBy,
    status: res.sent ? 'sent' : 'failed',
    error_message: res.sent ? null : (res.reason ?? 'send_failed'),
    payload: { applicant_id: args.applicantId, subject: args.built.subject, order: def?.order ?? null, mode, out_of_sequence: outOfSequence },
  });
  if (args.applicantId) {
    await admin.from('onboarding_events').insert({
      applicant_id: args.applicantId,
      event: res.sent ? `email_sent:${args.key}` : `email_failed:${args.key}`,
      metadata: { recipient: args.to, subject: args.built.subject, by: args.triggeredBy, mode, auto: mode === 'auto' || undefined, order: def?.order ?? null, out_of_sequence: outOfSequence },
    });
    if (res.sent && outOfSequence) {
      await workday(admin, args.applicantId, 'email_out_of_sequence', `Sent out of sequence by you: ${def?.label ?? args.key}`, outOfSequence, 'warning', { key: args.key });
    }
  }
  return { sent: res.sent, reason: res.reason, outOfSequence };
}

/** The Pro/applicant's stored language ('en' | 'es'); automatic mail is sent in it. */
export async function proLang(admin: SupabaseClient, applicantId: string | null | undefined): Promise<'en' | 'es'> {
  if (!applicantId) return 'en';
  const { data } = await admin.from('applicants').select('preferred_language, contractor_id').eq('id', applicantId).maybeSingle();
  if (data?.contractor_id) {
    const { data: p } = await admin.from('profiles').select('language').eq('user_id', data.contractor_id).maybeSingle();
    if (p?.language) return String(p.language).trim() === 'es' ? 'es' : 'en';
  }
  return data?.preferred_language === 'es' ? 'es' : 'en';
}
