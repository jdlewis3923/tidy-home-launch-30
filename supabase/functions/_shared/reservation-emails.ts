// Reservation confirmation + convert-invite copy. Dates come from launch.ts only.
import { LAUNCH_DATE_LONG, LAUNCH_MONTH, RESERVATION_SERVICE_LABEL, type ReservableService } from './launch.ts';
import { tidyEmailShell, TIDY_SITE } from './email-brand.ts';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const svcLabel = (s: string) => RESERVATION_SERVICE_LABEL[s as ReservableService] ?? s;

export const NEXT_STEPS = [
  ['Now', 'we hold your spot and your preferred day.'],
  [`Early ${LAUNCH_MONTH}`, 'we confirm your pro, your day and your time window, and you add a card. Nothing charges until your first visit.'],
  [LAUNCH_DATE_LONG, 'your first visit.'],
] as const;

export function reservationConfirmEmail(r: { first_name: string; services: string[]; waitlist_services: string[]; preferred_day: string; preferred_time: string }) {
  const reserved = r.services.filter((s) => !r.waitlist_services.includes(s));
  const steps = NEXT_STEPS.map(([w, t]) => `<tr><td style="padding:10px 0;border-top:1px solid #e9eff7;vertical-align:top;width:150px"><b style="color:#0f172a">${esc(w)}</b></td><td style="padding:10px 0;border-top:1px solid #e9eff7">${esc(t)}</td></tr>`).join('');
  const wl = r.waitlist_services.length
    ? `<p>The founding group for ${esc(r.waitlist_services.map(svcLabel).join(' and '))} is full, so you're first on the waitlist for it.</p>` : '';
  const subject = reserved.length ? `${r.first_name}, you're reserved` : `${r.first_name}, you're on the waitlist`;
  const html = tidyEmailShell({
    heading: reserved.length ? "You're reserved." : "You're on the waitlist.",
    eyebrow: 'Founding member · visit reservation',
    previewText: `First visits begin ${LAUNCH_DATE_LONG}.`,
    bodyHtml: `<p>Hi ${esc(r.first_name)},</p>${reserved.length ? `<p><b>Reserved:</b> ${esc(reserved.map(svcLabel).join(', '))} · preferred ${esc(r.preferred_day)} ${r.preferred_time === 'morning' ? 'mornings' : 'afternoons'}.</p>` : ''}${wl}<p style="margin:18px 0 4px"><b style="color:#0f172a">Here's what happens next:</b></p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:#475569">${steps}</table><p style="margin-top:18px">No card today, nothing to pay now.</p><p>Questions any time: <a href="mailto:hello@jointidy.co">hello@jointidy.co</a> or (786) 829-1141.</p>`,
    ctaUrl: TIDY_SITE, ctaLabel: 'Visit Tidy',
  });
  return { subject, html };
}

export function reservationConfirmSms(first: string) {
  return `Tidy: ${first}, you're reserved. We'll confirm your pro, day and time in early ${LAUNCH_MONTH} — nothing to pay now. First visits begin ${LAUNCH_DATE_LONG}. Questions: (786) 829-1141`;
}

export function convertEmail(r: { first_name: string; assigned_day: string; assigned_window: string; assigned_pro_first_name: string }, link: string) {
  const line = `${r.first_name} — your Tidy service starts ${LAUNCH_DATE_LONG}. Here's your day and time: ${r.assigned_day}, ${r.assigned_window}, with ${r.assigned_pro_first_name}. Confirm and add your card — nothing charges until after your first visit.`;
  const html = tidyEmailShell({
    heading: `Your Tidy service starts ${LAUNCH_DATE_LONG}`,
    eyebrow: 'Confirm your visit schedule',
    bodyHtml: `<p>${esc(line)}</p><p>Your quote is already set — just check it and add a card.</p><p>Questions any time: <a href="mailto:hello@jointidy.co">hello@jointidy.co</a> or (786) 829-1141.</p>`,
    ctaUrl: link, ctaLabel: 'Confirm & add card',
  });
  return { subject: `${r.first_name}, confirm your Tidy day and time`, html, sms: `Tidy: ${line} ${link}` };
}

/** Every reservation send is written to the email history. */
// deno-lint-ignore no-explicit-any
export async function logEmail(admin: any, template: string, to: string, subject: string, res: { sent: boolean; reason?: string; messageId?: string | null }, by: string) {
  await admin.from('email_send_log').insert({
    channel: 'email', template_name: template, recipient: to, status: res.sent ? 'sent' : 'failed',
    error_message: res.sent ? null : (res.reason ?? 'unknown'), brevo_message_id: res.messageId ?? null,
    triggered_by: by, payload: { subject },
  });
}
