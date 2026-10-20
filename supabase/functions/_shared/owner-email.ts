// Owner-only "Daily Signal" email. Navy layout copied from Justin's reference:
// every surface is a navy raster fill + bgcolor so phone dark modes leave it alone.
export const OWNER_EMAIL_MARKER = 'data-tidy-owner-email="20261020b"';
const SITE = 'https://jointidy.co';
const A = (id: string, name: string) => `${SITE}/__l5e/assets-v1/${id}/owner-v2-${name}`;
const IMG = {
  hero: A('05b669ef-c70a-4811-b422-e9084d263eca', 'hero.jpg'),
  footer: A('2066207c-963d-49d3-9ea2-fb8e1aacf77f', 'footer.jpg'),
  cleaning: A('54dd76da-4b85-4c1e-8d36-89430f1a781b', 'cleaning.jpg'),
  lawn: A('f99fcdf4-4f76-4e23-8a2a-35bc9451d49f', 'lawn.jpg'),
  car: A('063abeeb-4390-4d3d-8afa-bd29382705fd', 'car.jpg'),
  navy: A('e75640c0-99f7-4b57-85fc-dc261df3db06', 'navy.png'),
  card: A('ab2c7ab5-4264-4ed2-b6e3-bb05091bea67', 'card.png'),
  attnBg: A('af48d8df-5820-41d8-905c-8e959d55aa30', 'attn.png'),
  redBg: A('fd283dad-42c7-4447-89f1-a6d6e5934e18', 'red.png'),
  revenue: A('dcc07753-4f7e-4d97-b155-eae255c53ac5', 'i-revenue.png'),
  bookings: A('4b3b93cb-a05a-4893-bc3b-bbc15aee5d6c', 'i-bookings.png'),
  house: A('42cce7a8-6256-47fa-b938-db995207621e', 'i-house.png'),
  pros: A('47a72f43-777a-4d74-960e-5411ed94ad6e', 'i-pros.png'),
  attn: A('f5d9e4c1-a5ba-4131-baf2-ff60a3c3a8c5', 'i-attn.png'),
  alert: A('cca267c2-ccbe-424d-870d-def9167787f7', 'i-alert.png'),
  check: A('8021bdf6-4738-4408-9209-669f9a3ecb14', 'i-check.png'),
};
const NAVY = '#0b1428', CARD = '#111d36', LINE = '#22314f', WHITE = '#ffffff', MUTED = '#94a3b8';
const BLUE = '#3b82f6', GREEN = '#22c55e', GOLD = '#f5c518', RED = '#ef4444', SLATE = '#64748b';
const ATTN_BG = '#2a2208', RED_BG = '#300e14';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
// Strip emoji and break phone numbers so Outlook can't restyle them.
const clean = (s: string) => s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/^\s*[:\-–—]\s*/, '').trim();
const phoneSafe = (s: string) => esc(s).replace(/(\+?\d)(\d{3})(\d{3})(\d{4})/g, '$1&#8203;$2&#8203;$3&#8203;$4');
const fill = (hex: string, img: string) => `background-color:${hex};background-image:url('${img}');`;
const bg = (hex: string, img: string) => `bgcolor="${hex}" background="${img}" style="${fill(hex, img)}`;
const t = (c: string) => `color:${c};-webkit-text-fill-color:${c};`;
const FONT = "font-family:'Poppins',Arial,Helvetica,sans-serif;";

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
const link = (url: string) => (url.startsWith(`${SITE}/`) ? url : url.startsWith('/') ? `${SITE}${url}` : `${SITE}/admin/alerts`);
function split(text: string) {
  const c = clean(text);
  const m = c.split(/\n| — | – |: (?=.{12,})/);
  return { title: m[0], sub: m.slice(1).join(' ').trim() };
}
function pill(i: OwnerItem, colorText: string, outline: string) {
  if (!i.url) return '';
  return `<a href="${esc(link(i.url))}" style="display:inline-block;border:1px solid ${outline};border-radius:20px;padding:7px 14px;${FONT}font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;${t(colorText)}${fill(NAVY, IMG.navy)}">${esc(i.label ?? 'Review')}&nbsp;&nbsp;&rsaquo;</a>`;
}
const header = (title: string, sub: string, titleColor: string, subColor: string, right = '') =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="${FONT}"><p style="margin:0;font-size:17px;font-weight:800;letter-spacing:.3px;${t(titleColor)}">${title}</p>${sub ? `<p style="margin:3px 0 0;font-size:10px;font-weight:600;letter-spacing:1.6px;${t(subColor)}">${sub}</p>` : ''}</td>${right ? `<td align="right" valign="top" style="${FONT}">${right}</td>` : ''}</tr></table>`;
const box = (inner: string, hex: string, img: string, border: string) =>
  `<tr><td style="padding:0 12px 14px" ${bg(NAVY, IMG.navy)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:10px;${fill(hex, img)}" bgcolor="${hex}" background="${img}"><tr><td style="padding:16px 14px;${fill(hex, img)}">${inner}</td></tr></table></td></tr>`;

export function ownerEmail(data: OwnerEmailData): string {
  const attention = (data.attention ?? []).slice(0, 6);
  const unresolved = data.unresolved ?? [];
  const p = data.pulse;
  const when = data.edition === 'Tonight' ? 'Today' : data.edition === 'Today' ? 'Yesterday' : 'Today';

  const pulse = p ? box(header('THE PULSE', 'WHERE WE STAND TODAY', WHITE, BLUE, `<a href="${SITE}/admin" style="font-size:10px;font-weight:700;letter-spacing:.8px;text-decoration:none;${t(BLUE)}">VIEW FULL REPORT &rarr;</a>`) +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>${[
      [IMG.revenue, 'REVENUE', p.revenue ? `$${Math.round(p.revenue / 100).toLocaleString('en-US')}` : '$&nbsp;&mdash;', when],
      [IMG.bookings, 'BOOKINGS', String(p.bookings), when],
      [IMG.house, 'ACTIVE HOUSEHOLDS', String(p.households), 'Total'],
      [IMG.pros, 'PROS ON JOB', String(p.pros), when],
    ].map(([icon, label, value, foot]) => `<td width="25%" valign="top" style="padding:12px 8px;border:1px solid ${LINE};border-radius:8px;${fill(CARD, IMG.card)}${FONT}" bgcolor="${CARD}"><img src="${icon}" width="24" height="24" alt="" style="display:block;margin-bottom:12px"><p style="margin:0;min-height:26px;font-size:9px;font-weight:600;letter-spacing:.6px;line-height:1.35;${t('#cbd5e1')}">${label}</p><p style="margin:6px 0 4px;font-size:22px;font-weight:800;${t(WHITE)}">${value}</p><p style="margin:0;font-size:10px;${t(MUTED)}">${foot}</p></td>`).join(`<td width="7"></td>`)}</tr></table>`, CARD, IMG.card, LINE) : '';

  const attnRows = attention.length ? attention.map((i, n) => {
    const s = split(i.text);
    return `<tr><td width="34" valign="middle" style="padding:12px 8px 12px 0;${n ? `border-top:1px solid #4a3d10;` : ''}"><img src="${n % 2 ? IMG.check : IMG.attn}" width="26" height="26" alt="" style="display:block"></td><td valign="middle" style="padding:12px 8px 12px 0;${n ? `border-top:1px solid #4a3d10;` : ''}${FONT}"><p style="margin:0;font-size:14px;font-weight:600;line-height:1.35;${t(WHITE)}">${phoneSafe(s.title)}</p>${s.sub ? `<p style="margin:3px 0 0;font-size:12px;line-height:1.4;${t(MUTED)}">${phoneSafe(s.sub)}</p>` : ''}</td><td align="right" valign="middle" style="padding:12px 0;${n ? `border-top:1px solid #4a3d10;` : ''}">${pill(i, GOLD, GOLD)}</td></tr>`;
  }).join('') : `<tr><td style="padding:12px 0;${FONT}font-size:14px;${t(WHITE)}">No decisions waiting on you.</td></tr>`;
  const attn = box(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="40" valign="top"><img src="${IMG.attn}" width="30" height="30" alt="" style="display:block"></td><td>${header('YOUR ATTENTION', 'DECISIONS / INPUT NEEDED', GOLD, '#d6c48a')}</td></tr></table><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${attnRows}</table>`, ATTN_BG, IMG.attnBg, GOLD);

  const svc: Record<string, [string, string]> = { cleaning: [IMG.cleaning, BLUE], lawn: [IMG.lawn, GREEN], 'car care': [IMG.car, SLATE], car: [IMG.car, SLATE] };
  const ops = data.operations?.length ? `<tr><td style="padding:4px 24px 10px;${FONT}" ${bg(NAVY, IMG.navy)}">${header('TODAY’S OPERATIONS', 'AT A GLANCE', WHITE, BLUE)}</td></tr><tr><td style="padding:0 12px 14px" ${bg(NAVY, IMG.navy)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${data.operations.map((op) => {
    const [img, color] = svc[op.service.toLowerCase()] ?? [IMG.cleaning, BLUE];
    const pct = op.total ? Math.round((op.completed / op.total) * 100) : 0;
    return `<td width="33%" valign="top" style="border:1px solid ${LINE};border-radius:8px;${fill(CARD, IMG.card)}" bgcolor="${CARD}"><img src="${img}" width="180" alt="${esc(op.service)}" style="display:block;width:100%;height:auto;border-radius:8px 8px 0 0"><div style="padding:10px 10px 12px;${FONT}"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:.8px;${t(color === SLATE ? '#cbd5e1' : color)}">${esc(op.service.toUpperCase())}</p><p style="margin:8px 0 2px;font-size:20px;font-weight:800;${t(WHITE)}">${op.completed} / ${op.total}</p><p style="margin:0 0 10px;font-size:11px;${t('#cbd5e1')}">Jobs complete</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${pct ? `<td width="${pct}%" height="6" bgcolor="${color}" style="background-color:${color};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>` : ''}${pct < 100 ? `<td height="6" bgcolor="${LINE}" style="background-color:${LINE};border-radius:3px;font-size:0;line-height:0">&nbsp;</td>` : ''}</tr></table></div></td>`;
  }).join('<td width="7"></td>')}</tr></table></td></tr>` : '';

  const unRows = unresolved.length ? unresolved.slice(0, 12).map((i, n) => {
    const s = split(i.text);
    return `<tr><td width="36" valign="top" style="padding:12px 8px 12px 0;${n ? 'border-top:1px solid #5a1c26;' : ''}"><img src="${IMG.alert}" width="26" height="26" alt="" style="display:block"></td><td valign="top" style="padding:12px 0;${n ? 'border-top:1px solid #5a1c26;' : ''}${FONT}"><p style="margin:0;font-size:14px;font-weight:600;line-height:1.35;${t(WHITE)}">${phoneSafe(s.title)}</p>${i.url ? `<a href="${esc(link(i.url))}" style="font-size:12px;text-decoration:none;${t(BLUE)}">${esc(i.label ?? 'Review')}</a>` : s.sub ? `<p style="margin:3px 0 0;font-size:12px;${t(MUTED)}">${phoneSafe(s.sub)}</p>` : ''}</td></tr>`;
  }).join('') : `<tr><td style="padding:12px 0;${FONT}font-size:14px;${t(WHITE)}">No unresolved alerts.</td></tr>`;
  const un = box(header('UNRESOLVED ITEMS', '', WHITE, RED, `<span style="font-size:10px;font-weight:700;letter-spacing:1px;${t(RED)}">${unresolved.length} ITEM${unresolved.length === 1 ? '' : 'S'}</span>`) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">${unRows}</table>`, RED_BG, IMG.redBg, '#7f1d2a');

  const extra = data.sections.filter((s) => s.items.length).map((s) => box(header(esc(s.title.toUpperCase()), 'LATEST UPDATE', WHITE, s.red ? RED : BLUE) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px">${s.items.map((i, n) => { const x = split(i.text); return `<tr><td valign="middle" style="padding:10px 8px 10px 0;${n ? `border-top:1px solid ${LINE};` : ''}${FONT}"><p style="margin:0;font-size:13px;line-height:1.45;${t(WHITE)}">${phoneSafe(x.title)}</p>${x.sub ? `<p style="margin:2px 0 0;font-size:12px;${t(MUTED)}">${phoneSafe(x.sub)}</p>` : ''}</td><td align="right" valign="middle" style="padding:10px 0;${n ? `border-top:1px solid ${LINE};` : ''}">${pill(i, WHITE, BLUE)}</td></tr>`; }).join('')}</table>`, s.red ? RED_BG : CARD, s.red ? IMG.redBg : IMG.card, s.red ? '#7f1d2a' : LINE)).join('');

  const priorities = [...attention, ...unresolved].filter((i, n, a) => i.url && a.findIndex((x) => x.text === i.text) === n).slice(0, 3);
  const ceo = box(header('THE CEO CALL', 'TOP PRIORITIES FOR TOMORROW', WHITE, BLUE) + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${priorities.length ? priorities.map((i, n) => `<tr><td style="padding:4px 0"><a href="${esc(link(i.url!))}" style="display:block;text-decoration:none;border:1px solid ${LINE};border-radius:8px;${fill(NAVY, IMG.navy)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="40" style="padding:10px 0 10px 10px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="24" height="24" align="center" bgcolor="${BLUE}" style="background-color:${BLUE};border-radius:12px;${FONT}font-size:12px;font-weight:700;${t(WHITE)}">${n + 1}</td></tr></table></td><td style="padding:10px 6px;${FONT}font-size:13px;font-weight:600;${t(WHITE)}">${phoneSafe(split(i.text).title)}</td><td width="24" align="center" style="${FONT}font-size:18px;${t(BLUE)}">&rsaquo;</td></tr></table></a></td></tr>`).join('') : `<tr><td style="${FONT}font-size:14px;${t(WHITE)}">Nothing needs a decision right now.</td></tr>`}</table>`, CARD, IMG.card, LINE);

  return `<!doctype html><html lang="en" ${OWNER_EMAIL_MARKER}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><meta name="x-apple-disable-message-reformatting"><style>:root{color-scheme:dark}body{margin:0!important;padding:0!important}a[x-apple-data-detectors],u+#body a{color:inherit!important;text-decoration:none!important}</style></head><body id="body" ${bg(NAVY, IMG.navy)}margin:0;padding:0;${FONT}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${bg(NAVY, IMG.navy)}"><tr><td align="center" ${bg(NAVY, IMG.navy)}"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;${fill(NAVY, IMG.navy)}" bgcolor="${NAVY}"><tr><td style="padding:0 0 4px" ${bg(NAVY, IMG.navy)}"><img src="${IMG.hero}" width="600" alt="Tidy · The Daily Signal · CEO Update. More life. Less chores. Cleaning · Lawn · Car Care" style="display:block;width:100%;height:auto;border:0"></td></tr><tr><td align="right" style="padding:6px 22px 14px;${FONT}font-size:10px;font-weight:600;letter-spacing:1.4px;${t(MUTED)}" ${bg(NAVY, IMG.navy)}">${esc(data.edition.toUpperCase())} &middot; ${esc(data.date)}</td></tr>${pulse}${attn}${ops}${un}${extra}${ceo}<tr><td style="padding:0 12px 14px" ${bg(NAVY, IMG.navy)}"><img src="${IMG.footer}" width="576" alt="Keep building. More life. Less chores. Tidy CEO update." style="display:block;width:100%;height:auto;border-radius:10px"></td></tr><tr><td style="padding:4px 24px 26px;${FONT}font-size:10px;font-weight:600;letter-spacing:1.4px;line-height:1.8;${t(MUTED)}" ${bg(NAVY, IMG.navy)}">TIDY HOME CONCIERGE<br>CLEANING &middot; LAWN &middot; CAR CARE<br><a href="${SITE}/admin/alerts" style="text-decoration:none;${t(BLUE)}">OPEN ALERTS</a></td></tr></table></td></tr></table></body></html>`;
}

export function isOwnerEmail(html: string): boolean {
  return html.includes(OWNER_EMAIL_MARKER) && html.includes(IMG.hero) && html.includes(IMG.navy);
}
