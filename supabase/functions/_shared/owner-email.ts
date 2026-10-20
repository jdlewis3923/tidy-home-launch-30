import { TIDY_LOGO, TIDY_EMAIL_WHITE, TIDY_EMAIL_GOLD, pickEmailArt } from './email-brand.ts';

export const OWNER_EMAIL_MARKER = 'data-tidy-owner-email="20261020"';
const SITE = 'https://jointidy.co';
const BANNER = `${SITE}/__l5e/assets-v1/a7a09897-49c3-4eb1-8fef-f1a143a47d33/owner-signal-banner.jpg`;
const FOOTER = `${SITE}/__l5e/assets-v1/4b64fdb3-3492-4134-91a9-ecbe39017e14/owner-signal-footer.jpg`;
const INK = '#0f172a';
const BLUE = '#1688ed';
const GOLD = '#f5c518';
const GREEN = '#16a86a';
const RED = '#cf3038';
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const white = `background-color:#ffffff;background-image:url('${TIDY_EMAIL_WHITE}');`;
const text = (color = INK) => `color:${color};-webkit-text-fill-color:${color};`;
export interface OwnerItem { text: string; url?: string; label?: string }
export interface OwnerSection { title: string; red?: boolean; items: OwnerItem[] }
export interface OwnerEmailData {
  date: string;
  edition: string;
  sections: OwnerSection[];
  attention?: OwnerItem[];
  unresolved?: OwnerItem[];
  pulse?: { revenue: number; bookings: number; households: number; pros: number };
  operations?: { service: string; completed: number; total: number }[];
}
const link = (url: string) => url.startsWith(`${SITE}/`) ? url : `${SITE}/admin/alerts`;
const button = (i: OwnerItem) => i.url ? `<a href="${esc(link(i.url))}" style="display:inline-block;border:1px solid ${GOLD};border-radius:20px;padding:7px 13px;font:700 11px Arial;text-decoration:none;${text(INK)}background-color:${GOLD};background-image:url('${TIDY_EMAIL_GOLD}');white-space:nowrap">${esc(i.label ?? 'Review')} &rsaquo;</a>` : '';
function rows(items: OwnerItem[], numbered = false) {
  return items.map((i, n) => `<tr><td width="26" valign="top" style="padding:10px 4px 10px 0;${white}${text(BLUE)}font:700 15px Arial">${numbered ? n + 1 : '&bull;'}</td><td valign="top" style="padding:10px 6px 10px 0;border-bottom:1px solid #e8edf3;${white}${text()}font:14px/1.45 Arial">${esc(i.text).replace(/\n/g, '<br>')}</td><td align="right" valign="middle" style="padding:8px 0;${white}">${button(i)}</td></tr>`).join('');
}
function panel(title: string, subtitle: string, content: string, color = BLUE) {
  return `<tr><td style="padding:0 12px 12px;${white}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${color};border-radius:8px;${white}"><tr><td style="padding:14px 12px 8px;${white}"><h2 style="margin:0;font:800 16px Arial;${text(title === 'YOUR ATTENTION' ? '#9c7400' : INK)}">${title}</h2><p style="margin:4px 0 0;font:700 9px Arial;letter-spacing:1px;${text(color)}">${subtitle}</p></td></tr><tr><td style="padding:0 12px 12px;${white}">${content}</td></tr></table></td></tr>`;
}
export function ownerEmail(data: OwnerEmailData): string {
  const pulse = data.pulse;
  const stats = pulse ? [
    ['REVENUE', `$${(pulse.revenue / 100).toFixed(0)}`, 'credit-card', BLUE],
    ['BOOKINGS', String(pulse.bookings), 'calendar-days', GREEN],
    ['ACTIVE HOUSEHOLDS', String(pulse.households), 'house', BLUE],
    ['PROS ON JOB', String(pulse.pros), 'sparkles', BLUE],
  ] : [];
  const iconBase = TIDY_LOGO.slice(0, TIDY_LOGO.indexOf('brand%2F')) + 'brand%2Femail%2Ficons%2F';
  const statCells = stats.map(([label, value, icon, color]) => `<td width="25%" valign="top" style="padding:10px 7px;border:1px solid #e2ebf4;border-radius:6px;${white}"><img src="${iconBase}${icon}.png" width="22" height="22" alt="" style="display:block;margin:0 0 10px"><p style="min-height:24px;margin:0;font:700 9px/1.3 Arial;${text(color)}">${label}</p><p style="margin:4px 0;font:800 22px Arial;${text()}">${value}</p><p style="margin:0;font:10px Arial;${text('#53667b')}">${label === 'ACTIVE HOUSEHOLDS' ? 'Total' : data.edition === 'Today' ? 'Yesterday' : 'Today'}</p></td>`).join('<td width="8" style="'+white+'"></td>');
  const attention = data.attention ?? [];
  const unresolved = data.unresolved ?? [];
  const serviceColors = [BLUE, GREEN, '#657cab'];
  const operations = data.operations?.map((op, n) => {
    const color = serviceColors[n] ?? BLUE;
    const art = pickEmailArt(op.service);
    const percent = op.total ? Math.round(op.completed / op.total * 100) : 0;
    return `<td width="33%" valign="top" style="border:1px solid #e2ebf4;border-radius:6px;${white}"><img src="${art.image}" width="174" height="92" alt="${esc(op.service)}" style="display:block;width:100%;height:auto"><div style="padding:10px;${white}"><p style="margin:0;font:700 10px Arial;${text(color)}">${esc(op.service.toUpperCase())}</p><p style="margin:10px 0 4px;font:800 22px Arial;${text()}">${op.completed} / ${op.total}</p><p style="margin:0 0 10px;font:10px Arial;${text('#53667b')}">Jobs complete</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="${percent}%" height="5" bgcolor="${color}" style="background:${color};font-size:0">${percent ? '&nbsp;' : ''}</td><td height="5" bgcolor="#e8edf3" style="background:#e8edf3;font-size:0">&nbsp;</td></tr></table></div></td>`;
  }).join('<td width="10" style="'+white+'"></td>') ?? '';
  const priorities = attention.filter((i) => i.url).slice(0, 3);
  const sections = data.sections.filter((s) => s.items.length).map((s) => panel(esc(s.title.toUpperCase()), 'LATEST UPDATE', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(s.items)}</table>`, s.red ? RED : BLUE)).join('');
  return `<!doctype html><html lang="en" ${OWNER_EMAIL_MARKER}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><meta name="x-apple-disable-message-reformatting"><style>:root{color-scheme:light only}body,table,td{background-color:#ffffff!important;background-image:url('${TIDY_EMAIL_WHITE}')!important}[data-ogsb] body,[data-ogsb] table,[data-ogsb] td{background-color:#ffffff!important}@media(prefers-color-scheme:dark){body,table,td{background-color:#ffffff!important}}</style></head><body bgcolor="#ffffff" background="${TIDY_EMAIL_WHITE}" style="margin:0;padding:0;${white}${text()}font-family:Arial,sans-serif"><table role="presentation" width="100%" bgcolor="#ffffff" background="${TIDY_EMAIL_WHITE}" cellpadding="0" cellspacing="0" style="${white}"><tr><td align="center" bgcolor="#ffffff" background="${TIDY_EMAIL_WHITE}" style="${white}padding:12px 0"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;${white}"><tr><td style="padding:10px 16px;${white}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${white}"><img src="${TIDY_LOGO}" width="94" height="78" alt="Tidy" style="display:block"></td><td align="right" style="${white}${text(BLUE)}font:700 10px/1.7 Arial;letter-spacing:1px">THE DAILY SIGNAL<br>CEO UPDATE<br><span style="${text('#53667b')}font-size:9px">${esc(data.date)} &middot; ${esc(data.edition)}</span></td></tr></table></td></tr><tr><td style="padding:0 12px 12px;${white}"><img src="${BANNER}" width="576" alt="More life. Less chores. Cleaning · Lawn · Car Care" style="display:block;width:100%;height:auto;border:0"></td></tr>${stats.length ? panel('THE PULSE', 'WHERE WE STAND TODAY', `<p style="text-align:right;margin:0 0 10px"><a href="${SITE}/admin" style="font:700 9px Arial;text-decoration:none;${text(BLUE)}">VIEW FULL REPORT &rarr;</a></p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${statCells}</table>`) : ''}${panel('YOUR ATTENTION', 'DECISIONS / INPUT NEEDED', attention.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(attention)}</table>` : `<p style="font:14px Arial;${text()}">No decisions waiting on you.</p>`, GOLD)}${operations ? panel("TODAY’S OPERATIONS", 'AT A GLANCE', `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${operations}</tr></table>`) : ''}${panel('UNRESOLVED ITEMS', `${unresolved.length} ITEMS`, unresolved.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(unresolved)}</table>` : `<p style="font:14px Arial;${text()}">No unresolved alerts.</p>`, RED)}${sections}${panel('THE CEO CALL', 'TOP PRIORITIES', priorities.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(priorities, true)}</table>` : `<p style="font:14px Arial;${text()}">Nothing needs a decision right now.</p>`)}<tr><td style="padding:0 12px 16px;${white}"><img src="${FOOTER}" alt="Keep building. More life. Less chores. Tidy CEO update." width="576" style="display:block;width:100%;height:auto"></td></tr><tr><td style="padding:0 16px 20px;${white}${text('#53667b')}font:10px/1.7 Arial">TIDY HOME CONCIERGE LLC<br>2121 Biscayne Blvd #1562, Miami, FL 33137<br><a href="${SITE}/admin/alerts" style="${text(BLUE)}">Open alerts</a> &middot; jointidy.co &middot; (786) 829-1141</td></tr></table></td></tr></table></body></html>`;
}

export function isOwnerEmail(html: string): boolean {
  return html.includes(OWNER_EMAIL_MARKER) && html.includes(TIDY_LOGO) && html.includes(TIDY_EMAIL_WHITE) && html.includes(BANNER);
}