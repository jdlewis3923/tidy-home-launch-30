// Reservation confirmation + convert-invite copy. Dates come from launch_config (passed in as cfg).
import { RESERVATION_SERVICE_LABEL, CAR_OPENS_LINE, fmtLaunchDate, firstVisitOn, launchScope, startsLine, type LaunchConfig, type ReservableService } from './launch.ts';
import { tidyEmailShell, TIDY_SITE } from './email-brand.ts';

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
export const svcLabel = (s: string) => RESERVATION_SERVICE_LABEL[s as ReservableService] ?? s;

/** The earliest first-visit date among these services; null when only car care is reserved and it has no date. */
function firstDate(cfg: LaunchConfig, services: string[]): string | null {
  const ds = (services.length ? services : ['cleaning']).map((s) => cfg[launchScope(s)]?.first_visit_date).filter(Boolean) as string[];
  return ds.sort()[0] ?? null;
}
function conversionMonth(cfg: LaunchConfig, services: string[], lang: 'en' | 'es' = 'en'): string {
  const ds = (services.length ? services : ['cleaning']).map((s) => cfg[launchScope(s)]?.conversion_date).filter(Boolean) as string[];
  return fmtLaunchDate(ds.sort()[0], lang, 'month');
}
export function nextSteps(cfg: LaunchConfig, services: string[]) {
  const month = conversionMonth(cfg, services);
  return [
    ['Now', 'we hold your spot and your preferred day.'],
    [month ? `Early ${month}` : 'When car care opens', 'we confirm your pro, your day and your time window, and you add a card. Nothing charges until your first visit.'],
    [startsLine(cfg, 'en', services), 'your first visit.'],
  ] as const;
}

export function reservationConfirmEmail(r: { first_name: string; services: string[]; waitlist_services: string[]; preferred_day: string; preferred_time: string }, cfg: LaunchConfig, scopeHtml = '') {
  const reserved = r.services.filter((s) => !r.waitlist_services.includes(s));
  const steps = nextSteps(cfg, r.services).map(([w, t]) => `<tr><td style="padding:10px 0;border-top:1px solid #e9eff7;vertical-align:top;width:150px"><b style="color:#0f172a">${esc(w)}</b></td><td style="padding:10px 0;border-top:1px solid #e9eff7">${esc(t)}</td></tr>`).join('');
  const wl = r.waitlist_services.length
    ? `<p>The founding group for ${esc(r.waitlist_services.map(svcLabel).join(' and '))} is full, so you're first on the waitlist for it.</p>` : '';
  const subject = reserved.length ? `${r.first_name}, you're reserved` : `${r.first_name}, you're on the waitlist`;
  const html = tidyEmailShell({
    heading: reserved.length ? "You're reserved." : "You're on the waitlist.",
    eyebrow: 'Founding member · visit reservation',
    previewText: `${startsLine(cfg, 'en', r.services)}.`,
    bodyHtml: `<p>Hi ${esc(r.first_name)},</p>${reserved.length ? `<p><b>Reserved:</b> ${esc(reserved.map(svcLabel).join(', '))} · preferred ${esc(r.preferred_day)} ${r.preferred_time === 'morning' ? 'mornings' : 'afternoons'}.</p>` : ''}${wl}<p style="margin:18px 0 4px"><b style="color:#0f172a">Here's what happens next:</b></p><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:#475569">${steps}</table><p style="margin-top:18px">No card today, nothing to pay now.</p><p>Questions any time: <a href="mailto:hello@jointidy.co">hello@jointidy.co</a> or (786) 829-1141.</p>${scopeHtml}`,
    ctaUrl: TIDY_SITE, ctaLabel: 'Visit Tidy',
  });
  return { subject, html };
}

export function reservationConfirmSms(first: string, cfg: LaunchConfig, services: string[], lang: 'en' | 'es' = 'en') {
  const month = conversionMonth(cfg, services, lang);
  if (!month) {
    return lang === 'es'
      ? `Tidy: ${first}, tu lugar está reservado — nada que pagar ahora. ${CAR_OPENS_LINE.es}. Preguntas: (786) 829-1141`
      : `Tidy: ${first}, you're reserved — nothing to pay now. ${CAR_OPENS_LINE.en}. Questions: (786) 829-1141`;
  }
  return lang === 'es'
    ? `Tidy: ${first}, tu lugar está reservado. Confirmaremos tu profesional, día y horario a principios de ${month} — nada que pagar ahora. ${startsLine(cfg, 'es', services)}. Preguntas: (786) 829-1141`
    : `Tidy: ${first}, you're reserved. We'll confirm your pro, day and time in early ${month} — nothing to pay now. ${startsLine(cfg, 'en', services)}. Questions: (786) 829-1141`;
}

/**
 * The convert invite. `blackouts` are no-visit dates (Thanksgiving): a member whose day
 * falls on one is told their real first visit, a week later, on the same weekday.
 * `carWaiting`: the car part waits for its own date and joins the same bill later.
 */
export function convertEmail(r: { first_name: string; assigned_day: string; assigned_window: string; assigned_pro_first_name: string; services?: string[] }, link: string, cfg: LaunchConfig, blackouts: string[] = [], carWaiting = false) {
  const services = (r.services ?? []).filter((s) => !carWaiting || launchScope(s) !== 'car');
  const startIso = firstDate(cfg, services);
  const start = fmtLaunchDate(startIso);
  const naive = startIso ? firstVisitOn(startIso, r.assigned_day) : null;
  const actual = startIso ? firstVisitOn(startIso, r.assigned_day, blackouts) : null;
  const holiday = naive && actual && naive !== actual
    ? ` Your first visit is ${new Date(`${actual}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })} (no visits on Thanksgiving).`
    : '';
  const car = carWaiting ? ` Car care starts later: ${CAR_OPENS_LINE.en}. We'll add it to this same bill when it starts.` : '';
  const line = `${r.first_name} — your Tidy service starts ${start}. Here's your day and time: ${r.assigned_day}, ${r.assigned_window}, with ${r.assigned_pro_first_name}.${holiday} Confirm and add your card — nothing charges until after your first visit.${car}`;
  const html = tidyEmailShell({
    heading: `Your Tidy service starts ${start}`,
    eyebrow: 'Confirm your visit schedule',
    bodyHtml: `<p>${esc(line)}</p><p>Your quote is already set — just check it and add a card.</p><p>Questions any time: <a href="mailto:hello@jointidy.co">hello@jointidy.co</a> or (786) 829-1141.</p>`,
    ctaUrl: link, ctaLabel: 'Confirm & add card',
  });
  return { subject: `${r.first_name}, confirm your Tidy day and time`, html, sms: `Tidy: ${line} ${link}`, first_visit: actual };
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

// ── Founding page (/founding) member confirmation — bilingual, its own template ──
const DAY_ES: Record<string, string> = { Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles', Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado', 'Any day': 'cualquier día' };
const SVC_ES: Record<string, string> = { cleaning: 'Limpieza de casa', lawn: 'Cuidado del jardín', detailing: 'Car Care' };
const CAD: Record<string, [string, string]> = { monthly: ['once a month', 'una vez al mes'], biweekly: ['every 2 weeks', 'cada 2 semanas'], weekly: ['weekly', 'cada semana'] };

export function foundingConfirmEmail(r: {
  first_name: string; lang: string; founding: boolean; monthly_cents: number; custom_quote: boolean;
  preferred_day: string; preferred_time: string; zip: string; gift_addons: string[];
  lines: Array<{ service: string; size: unknown; cadence: string | null; monthly: number }>;
}, cfg: LaunchConfig, scopeHtml = '') {
  const es = r.lang === 'es';
  const rows = r.lines.map((l) => {
    const name = es ? (SVC_ES[l.service] ?? l.service) : svcLabel(l.service);
    const cad = l.service === 'detailing' || !l.cadence ? '' : ` · ${(CAD[l.cadence] ?? [l.cadence, l.cadence])[es ? 1 : 0]}`;
    const price = l.size === 'quote' ? (es ? 'cotización personalizada' : 'custom quote') : `$${Math.round(l.monthly)}/${es ? 'mes' : 'mo'}`;
    return `<tr><td style="padding:8px 0;border-top:1px solid #e9eff7">${esc(name)}${esc(cad)}</td><td align="right" style="padding:8px 0;border-top:1px solid #e9eff7"><b>${esc(price)}</b></td></tr>`;
  }).join('');
  const total = r.custom_quote ? '' : `<tr><td style="padding:10px 0;border-top:2px solid #0f172a"><b>${es ? 'Total mensual' : 'Monthly total'}</b></td><td align="right" style="padding:10px 0;border-top:2px solid #0f172a"><b>$${(r.monthly_cents / 100).toFixed(0)}/${es ? 'mes' : 'mo'}</b></td></tr>`;
  const day = es ? `${DAY_ES[r.preferred_day] ?? r.preferred_day}, ${r.preferred_time === 'morning' ? 'por la mañana' : 'por la tarde'}` : `${r.preferred_day} ${r.preferred_time === 'morning' ? 'mornings' : 'afternoons'}`;
  const line = startsLine(cfg, es ? 'es' : 'en', r.lines.map((l) => l.service));
  const terms = r.founding
    ? (es ? 'Reservaste con beneficios de miembro fundador.' : 'You reserved with founding-member benefits.')
    : (es ? `Los hogares fundadores en ${r.zip} ya están completos — reservaste en términos estándar.` : `Founding homes are fully reserved in ${r.zip} — you reserved at standard terms.`);
  const body = `<p>${es ? 'Hola' : 'Hi'} ${esc(r.first_name)},</p>
<p><b>${es ? 'Sin cargo hoy.' : 'No charge today.'}</b> ${esc(line)}.</p>
<p>${es ? 'Te contactaremos aproximadamente una semana antes de tu primera visita para confirmar tu día, tu horario y tu profesional, y para configurar el pago en ese momento.' : "We'll contact you about a week before your first visit to confirm your day, your window and your Pro, and to set up payment then."}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font:14px/1.5 Arial,sans-serif;color:#334155">${rows}${total}</table>
<p>${es ? 'Día preferido' : 'Preferred day'}: ${esc(day)} · ZIP ${esc(r.zip)}</p>
${r.gift_addons.length ? `<p>${es ? 'Complemento gratis elegido' : 'Free add-on chosen'}: ${esc(r.gift_addons.join(', '))}</p>` : ''}
<p>${esc(terms)}</p>
<p style="color:#64748b">${es ? 'Preguntas' : 'Questions'}: (786) 829-1141 · hello@jointidy.co</p>${scopeHtml}`;
  return {
    subject: es ? `${r.first_name}, tu lugar está reservado` : `${r.first_name}, you're reserved`,
    html: tidyEmailShell({ heading: es ? 'Estás reservado. Sin cargo hoy.' : "You're reserved. No charge today.", eyebrow: es ? 'Reserva de miembro fundador' : 'Founding reservation', previewText: `${line}.`, bodyHtml: body, ctaUrl: TIDY_SITE, ctaLabel: es ? 'Visitar Tidy' : 'Visit Tidy' }),
  };
}
