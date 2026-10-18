/**
 * Tidy's single email design system — light mode only.
 *
 * All code-generated email is normalized through ensureTidyEmailBranding() in
 * brevo-send.ts. Provider-hosted templates are lightened + given hero art by
 * brandHostedTemplate(). Markup is table-based and inline-styled for broad
 * email-client support. No dark panels anywhere.
 */

export const TIDY_SITE = 'https://jointidy.co';
/** Official full TIDY wordmark. The favicon/standalone "T" is not an email logo. */
export const TIDY_LOGO = 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/storage/v1/object/public/social-images/brand%2Ftidy-logo-email.png';
export const TIDY_OWNER_EMAIL = 'hello@jointidy.co';
export const TIDY_EMAIL_MARKER = 'data-tidy-email="branded"';
export const TIDY_ART_MARKER = 'data-tidy-hero-photo="true"';
export const TIDY_EMAIL_VERSION = 'data-tidy-email-version="20261018-raster"';
const SURFACE_BASE = TIDY_LOGO.slice(0, TIDY_LOGO.indexOf('brand%2F')) + 'brand%2Femail%2F';
export const TIDY_EMAIL_WHITE = SURFACE_BASE + 'white-20261018.png';
export const TIDY_EMAIL_GOLD = SURFACE_BASE + 'gold-20261018.png';
/** Retired emoji-circle hero. Hosted templates carrying it are upgraded in place. */
const LEGACY_ART_ROW = /<tr data-tidy-hero-art="true">[\s\S]*?<\/p>\s*<\/td><\/tr>/gi;
const LEGACY_STRIP_ROW = /<tr data-tidy-service-strip="true">[\s\S]*?<\/table><\/td><\/tr>/i;

const PHOTO_BASE = 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/storage/v1/object/public/social-images/brand%2Femail%2F';

export interface TidyEmailArt {
  /** Photographic banner (1200x500, light, Miami). */
  image: string;
  label: string;
  alt: string;
}

const photo = (name: string, label: string, alt: string): TidyEmailArt => ({ image: `${PHOTO_BASE}${name}.jpg`, label, alt });

// Order matters: the first match wins.
const ART: Array<{ match: RegExp; art: TidyEmailArt }> = [
  { match: /(needs help|still open|support|urgent|alert|redo|damage|safety|no access|necesita ayuda|ayuda|problema)/i, art: photo('support-20261018', 'Tidy support', 'An illustrative Tidy support coordinator helping by phone') },
  { match: /(meet (?:the|your) team|meet (?:the|your) pro|your pro|team|equipo|conoce|pro.changed)/i, art: photo('team-20261018', 'Meet Tidy', 'An illustrative diverse team in blue Tidy uniforms') },
  { match: /(equipment|proof|loaded vehicle|work photos|herramientas|equipamiento)/i, art: photo('equipment-20261018', 'Equipment readiness', 'Illustrative cleaning, lawn and Car Care equipment in separate groups') },
  { match: /(lawn size|turf|sqft|sq ft|césped|cesped)/i, art: photo('lawn', 'Lawn', 'A manicured lawn in front of a Miami home') },
  { match: /(payment|invoice|receipt|billing|payout|deposit|card exp|credit.card|pago|factura|tarjeta)/i, art: photo('billing', 'Billing', 'A card and receipt on a white desk') },
  { match: /(digest|report|summary|kpi|metrics|snapshot|resumen)/i, art: photo('report', 'Your snapshot', 'A laptop with a soft chart by a window') },
  { match: /(review|rating|feedback|referral|refer a|neighbor|reseña|recomienda)/i, art: photo('community', 'Your neighbors', 'Neighbors chatting over a white fence') },
  { match: /(contract|agreement|signed|signature|firma)/i, art: photo('contract', 'Contractor agreement', 'A signed agreement on a sunlit desk') },
  { match: /(badge photo|badge_photo|photo retake|photo_retake|retake|foto de (?:perfil|identificación))/i, art: photo('photo', 'Badge photo', 'A portrait being taken against a plain wall') },
  { match: /(background check|checkr|screening)/i, art: photo('verify', 'Background check', 'A checklist being reviewed in a bright entryway') },
  { match: /(insurance|coi|certificate|liability)/i, art: photo('verify', 'Insurance', 'A checklist being reviewed in a bright entryway') },
  { match: /(kit|uniform|polo|badge|magnet|shirt)/i, art: photo('kit', 'Your Tidy kit', 'Folded polos, a badge and a vest on a table') },
  { match: /(all set|you're set|ready to start|welcome|onboard|getting started|next step|bienvenid)/i, art: photo('welcome', 'Welcome to Tidy', 'A Tidy Pro arriving at a bright Miami home') },
  { match: /(visit|appointment|schedule|booking|arriv|reschedul)/i, art: photo('visit', 'Your visit', 'A phone and calendar on a sunny desk') },
  { match: /(lawn|yard|mow)/i, art: photo('lawn', 'Lawn', 'A manicured lawn in front of a Miami home') },
  { match: /(car care|shine complete|detail)/i, art: photo('car', 'Car Care', 'A freshly washed car in a sunny driveway') },
  { match: /(clean)/i, art: photo('cleaning', 'Cleaning', 'A spotless sunlit living room') },
  { match: /(payment|invoice|receipt|billing|payout|deposit|card)/i, art: photo('billing', 'Billing', 'A card and receipt on a white desk') },
  { match: /(review|rating|feedback|star|referral|refer a|friend|credit|neighbor)/i, art: photo('community', 'Your neighbors', 'Neighbors chatting over a white fence') },
  { match: /(applicant|apply|hiring|interview|offer|candidate)/i, art: photo('team-20261018', 'Hiring', 'An illustrative diverse team in blue Tidy uniforms') },
  { match: /(digest|report|summary|kpi|weekly|metrics|alert|urgent|failed|attention|issue|action required)/i, art: photo('report', 'Your snapshot', 'A laptop with a soft chart by a window') },
  { match: /(password|sign in|log in|verify|confirm your email|account|contraseña|cuenta)/i, art: photo('verify', 'Your account', 'A verification checklist being reviewed') },
];

const DEFAULT_ART: TidyEmailArt = photo('home', 'Tidy Home Concierge', 'A bright Miami home at golden hour');

/** Pick a relevant photographic banner for an email based on its subject/heading. */
export function pickEmailArt(topic?: string): TidyEmailArt {
  if (!topic) return DEFAULT_ART;
  for (const entry of ART) if (entry.match.test(topic)) return entry.art;
  return DEFAULT_ART;
}

export function emailHeroArt(art: TidyEmailArt): string {
  return `<tr ${TIDY_ART_MARKER}><td class="ts" style="padding:0;${SOFT};font-size:0;line-height:0"><img src="${art.image}" alt="${art.alt}" width="600" height="250" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`;
}

const ICON_BASE = 'https://vcdhpsfuilrrrqfhfsjt.supabase.co/storage/v1/object/public/social-images/brand%2Femail%2Ficons%2F';
export type TidyEmailIcon = 'calendar-days' | 'car' | 'clock' | 'credit-card' | 'gift' | 'hash' | 'house' | 'leaf' | 'map-pin' | 'ruler' | 'sparkles' | 'spray-can' | 'star' | 'tag';
export interface TidyEmailFact { icon: TidyEmailIcon; label: string; value: string }

/** Solid white that dark-mode clients (Outlook app, Gmail) don't invert: a gradient background image. */
const W = 'background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff)';
const PAGE = 'background-color:#ffffff;background-image:linear-gradient(#ffffff,#ffffff)';
const SOFT = W;

/** Dark-mode lock for clients that honour <style> (Apple Mail, Outlook.com/iOS via data-ogsc/ogsb). */
const DARK_LOCK = `<style>:root{color-scheme:light only;supported-color-schemes:light only}
body,.tw{background:#ffffff!important}
[data-ogsb] .tw,[data-ogsb] body{background-color:#ffffff!important}
[data-ogsb] .ts{background-color:#ffffff!important}
[data-ogsc] .tn,[data-ogsc] .tn *{color:#0f172a!important}
[data-ogsc] .tb,[data-ogsc] .tb *{color:#475569!important}
[data-ogsc] .tg{color:#b48a00!important}
@media (prefers-color-scheme:dark){body,.tw{background:#ffffff!important}.ts{background:#ffffff!important}.tn,.tn *{color:#0f172a!important}.tb,.tb *{color:#475569!important}}
.tn,.tn *{-webkit-text-fill-color:#0f172a!important}.tb,.tb *{-webkit-text-fill-color:#475569!important}
.tgold,[data-ogsb] .tgold{background-color:#f5c518!important;background-image:url('${TIDY_EMAIL_GOLD}')!important;color:#0f172a!important;-webkit-text-fill-color:#0f172a!important}
</style>`;

/** Two-column icon tiles: the useful, at-a-glance facts of this email. */
export function emailFactsCard(facts: TidyEmailFact[]): string {
  const items = facts.filter((f) => f.value && !/\{\w+\}/.test(f.value)).slice(0, 4);
  if (!items.length) return '';
  const cell = (f: TidyEmailFact) => `<td class="ts" width="50%" valign="top" style="${SOFT};border:1px solid #e3ecf7;border-radius:12px;padding:14px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="${W};border-radius:10px;width:40px;height:40px;text-align:center"><img src="${ICON_BASE}${f.icon}.png" width="22" height="22" alt="" style="display:block;margin:9px auto;border:0"></td><td valign="middle" style="padding-left:12px"><p class="tb" style="margin:0;font:700 10px Arial,sans-serif;letter-spacing:1.2px;text-transform:uppercase;color:#64748b">${f.label}</p><p class="tn" style="margin:2px 0 0;font:800 15px/1.3 Arial,sans-serif;color:#0f172a">${f.value}</p></td></tr></table></td>`;
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const b = items[i + 1];
    rows.push(`<tr>${cell(items[i])}<td width="10" style="font-size:0">&nbsp;</td>${b ? cell(b) : '<td width="50%">&nbsp;</td>'}</tr><tr><td colspan="3" style="height:10px;font-size:0;line-height:0">&nbsp;</td></tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px">${rows.join('')}</table>`;
}

export interface TidyEmailShellOptions {
  /** Icon tiles shown above the body copy. */
  facts?: TidyEmailFact[];
  heading?: string;
  eyebrow?: string;
  previewText?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  recipientContext?: string;
  /** Overrides the keyword-derived hero art. */
  art?: TidyEmailArt;
  artTopic?: string;
}

export function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td class="tgold" bgcolor="#f5c518" background="${TIDY_EMAIL_GOLD}" style="background-color:#f5c518;background-image:url('${TIDY_EMAIL_GOLD}');border-radius:9px"><a class="tgold" href="${url}" style="background-color:#f5c518;background-image:url('${TIDY_EMAIL_GOLD}');-webkit-text-fill-color:#0f172a;display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#0f172a;text-decoration:none">${label} &rarr;</a></td></tr></table>`;
}

/** Image fills also work when a phone client strips CSS gradients.
 * No sender can control the surrounding email application's dark chrome. */
export function protectEmailAppearance(html: string): string {
  if (html.includes(TIDY_EMAIL_VERSION)) return html;
  let next = html.replace(/data-tidy-email-version="[^"]*"/g, '').replace(/<html\b/i, `<html ${TIDY_EMAIL_VERSION}`);
  next = next.replace(/<(body|table|td|div|a)\b[^>]*>/gi, (tag, name: string) => {
    const style = tag.match(/\bstyle="([^"]*)"/i)?.[1] ?? '';
    const gold = /(?:background(?:-color)?\s*:\s*#(?:fccc00|f5c518)|bgcolor="#(?:fccc00|f5c518)|class="[^"]*tgold)/i.test(tag);
    if (name.toLowerCase() === 'a' && !gold) return tag;
    const color = gold ? '#f5c518' : '#ffffff';
    const image = gold ? TIDY_EMAIL_GOLD : TIDY_EMAIL_WHITE;
    const cleaned = style.replace(/background(?:-color|-image)?\s*:[^;]*(?:;|$)/gi, '').replace(/;+$/g, '');
    let result = tag.replace(/\s(?:style|bgcolor|background)="[^"]*"/gi, '');
    if (gold && !/class="[^"]*tgold/.test(result)) {
      result = /class="/.test(result) ? result.replace(/class="/, 'class="tgold ') : result.replace(/>$/, ' class="tgold">');
    }
    return result.replace(/>$/, ` bgcolor="${color}" background="${image}" style="${cleaned}${cleaned ? ';' : ''}background-color:${color};background-image:url('${image}');">`);
  });
  if (!next.includes('-webkit-text-fill-color')) {
    next = next.includes('</head>') ? next.replace('</head>', `${DARK_LOCK}</head>`) : `${DARK_LOCK}${next}`;
  }
  return next;
}

export function emailServiceStrip(): string {
  const dot = '<span style="color:#FCCC00;padding:0 10px">&#9679;</span>';
  return `<tr data-tidy-service-strip="true"><td class="tw tb" align="center" bgcolor="#ffffff" style="${W};border-bottom:1px solid #eef2f7;padding:12px 20px;font:700 10px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#475569">Cleaning${dot}Lawn${dot}Car Care</td></tr>`;
}

export function tidyEmailShell(opts: TidyEmailShellOptions): string {
  const preview = opts.previewText ?? opts.heading ?? 'A message from Tidy Home Concierge';
  const art = opts.art ?? pickEmailArt(opts.artTopic ?? `${opts.heading ?? ''} ${opts.eyebrow ?? ''} ${opts.previewText ?? ''}`);
  const heading = opts.heading
    ? `<h1 class="tn" style="margin:0 0 16px;font:800 26px/1.2 Arial,sans-serif;color:#0f172a">${opts.heading}</h1>`
    : '';
  const cta = opts.ctaUrl ? emailButton(opts.ctaUrl, opts.ctaLabel ?? 'Open Tidy') : '';
  const context = opts.recipientContext
    ? `<br><span style="color:#8494a8">${opts.recipientContext}</span>`
    : '';

  return protectEmailAppearance(`<!doctype html><html lang="en" ${TIDY_EMAIL_MARKER}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${opts.heading ?? 'Tidy Home Concierge'}</title>${DARK_LOCK}</head><body class="tw" style="margin:0;padding:0;${PAGE};-webkit-text-size-adjust:100%;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#ffffff">${preview}</div><table class="tw" role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="${PAGE}"><tr><td class="tw" align="center" style="padding:16px 8px 28px;${PAGE}"><table class="tw" role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:600px;${W};border:1px solid #e9eff7;border-radius:14px;overflow:hidden">
    <tr><td class="tw" bgcolor="#ffffff" style="${W};padding:16px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><a href="${TIDY_SITE}"><img src="${TIDY_LOGO}" alt="Tidy Home Concierge" width="106" height="88" style="display:block;width:106px;height:88px;object-fit:contain;border:0"></a></td><td class="tn" valign="middle" align="right" style="font:700 13px/1.35 Arial,sans-serif;color:#0f172a">More life.<br><span class="tg" style="color:#b48a00">Less chores.</span></td></tr></table></td></tr>
    <tr><td style="height:4px;background:#FCCC00;font-size:0;line-height:0">&nbsp;</td></tr>
    ${emailHeroArt(art)}
    ${emailServiceStrip()}
    <tr><td class="tw" bgcolor="#ffffff" style="${W};padding:26px 24px 30px">${opts.eyebrow ? `<p style="margin:0 0 8px;font:700 11px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#2563eb">${opts.eyebrow}</p>` : ''}${heading}${opts.facts ? emailFactsCard(opts.facts) : ''}<div class="tb" style="font:15px/1.65 Arial,sans-serif;color:#475569">${opts.bodyHtml}</div>${cta}</td></tr>
    <tr><td class="ts" bgcolor="#f4f8fc" style="${SOFT};border-top:1px solid #e6edf5;padding:20px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${TIDY_LOGO}" alt="Tidy" width="58" height="48" style="display:block;width:58px;height:48px;object-fit:contain;border:0"></td><td class="tb" align="right" style="font:11px/1.65 Arial,sans-serif;color:#5b6b80">Tidy Home Concierge LLC<br>2121 Biscayne Blvd #1562, Miami, FL 33137<br><a href="${TIDY_SITE}" style="color:#5b6b80">jointidy.co</a> · (786) 829-1141${context}</td></tr></table></td></tr>
  </table></td></tr></table></body></html>`);
}

export function ensureTidyEmailBranding(html: string, subject?: string): string {
  if (isTidyEmailCompliant(html)) return brandHostedTemplate(html, subject ?? 'Tidy').html;
  return tidyEmailShell({
    heading: subject,
    previewText: subject,
    bodyHtml: lightenEmailHtml(html),
    artTopic: `${subject ?? ''} ${html.slice(0, 400)}`,
  });
}

/** Fail-closed definition used by both generated mail and hosted templates. */
export function isTidyEmailCompliant(html: string): boolean {
  return html.includes(TIDY_EMAIL_MARKER) &&
    html.includes(TIDY_LOGO) &&
    html.includes('data-tidy-service-strip="true"') &&
    html.includes(TIDY_ART_MARKER) &&
    !/(background(?:-color)?\s*:\s*#(?:0f172a|0b1220|111827|1e293b)|bgcolor\s*=\s*"#(?:0f172a|0b1220|111827|1e293b)")/i.test(html);
}

/** Dark panels are not allowed in Tidy email — swap them for light surfaces. */
export function lightenEmailHtml(html: string): string {
  const darkToLight: Array<[RegExp, string]> = [
    [/#0f172a/gi, '#f4f8fc'],
    [/#0b1220/gi, '#f6f9fc'],
    [/#111827/gi, '#f4f8fc'],
    [/#1e293b/gi, '#eef3f9'],
    [/#0F1B2E/gi, '#f4f8fc'],
  ];
  let next = html;
  // Only recolor dark values used as backgrounds, keeping text navy-readable.
  next = next.replace(/(background(?:-color)?\s*:\s*)(#(?:0f172a|0b1220|111827|1e293b|0F1B2E))/gi, (_m, p1) => {
    let v = '#f4f8fc';
    for (const [re, light] of darkToLight) if (re.test(_m)) { v = light; break; }
    return `${p1}${v}`;
  });
  next = next.replace(/(bgcolor\s*=\s*")(#(?:0f172a|0b1220|111827|1e293b|0F1B2E))(")/gi, '$1#f4f8fc$3');
  // Text that was white on those dark panels must become readable.
  next = next.replace(/(color\s*:\s*)#(?:ffffff|fff)\b/gi, '$1#0f172a');
  // Gold-on-navy accents lose contrast on white.
  next = next.replace(/(color\s*:\s*)#(?:FCCC00|f5c518)\b/gi, '$1#b48a00');
  return next;
}

/** Upgrade a provider-hosted template in place without touching its subject or merge fields. */
export function brandHostedTemplate(html: string, heading: string): { html: string; changed: boolean; mode: 'updated' | 'wrapped' | 'unchanged' } {
  const art = pickEmailArt(heading);
  if (isTidyEmailCompliant(html)) {
    const revised = html.includes(TIDY_EMAIL_VERSION) ? html : html.replace(/<tr data-tidy-hero-photo="true">[\s\S]*?<\/tr>/i, emailHeroArt(art));
    const protectedHtml = protectEmailAppearance(revised);
    return { html: protectedHtml, changed: protectedHtml !== html, mode: protectedHtml === html ? 'unchanged' : 'updated' };
  }

  let next = lightenEmailHtml(
    html
      .replace(LEGACY_ART_ROW, '')
      .split('https://raw.githubusercontent.com/jdlewis3923/tidy-home-launch-30/main/tidy-logo-circle.png').join(TIDY_LOGO)
      .split(`${TIDY_SITE}/favicon-512x512.png`).join(TIDY_LOGO)
      .replace(/<html(?![^>]*data-tidy-email)/i, `<html ${TIDY_EMAIL_MARKER}`),
  );

  const strip = emailServiceStrip();
  const hero = emailHeroArt(art);

  // Legacy strip (emoji icons) + missing photo: swap in photo banner + new strip.
  if (LEGACY_STRIP_ROW.test(next) && !next.includes(TIDY_ART_MARKER)) {
    next = next.replace(LEGACY_STRIP_ROW, `${hero}${strip}`);
  }

  if (!next.includes('data-tidy-service-strip')) {
    if (next.includes('<!-- Hero banner -->')) {
      next = next.replace('<!-- Hero banner -->', `${strip}${hero}\n  <!-- Hero banner -->`);
    } else {
      const accent = /(<(?:div|tr)[^>]*background:\s*#(?:FCCC00|f5c518)[\s\S]*?<\/(?:div|tr)>)/i;
      if (accent.test(next)) next = next.replace(accent, `$1${strip}${hero}`);
      else {
        const body = next.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? next;
        return {
          html: tidyEmailShell({ heading, previewText: heading, bodyHtml: body, art }).replace('<tr><td style="background:#ffffff;border-bottom', '<tr data-tidy-service-strip="true"><td style="background:#ffffff;border-bottom'),
          changed: true,
          mode: 'wrapped',
        };
      }
    }
  } else if (!next.includes(TIDY_ART_MARKER)) {
    next = next.replace(/(<tr data-tidy-service-strip="true">[\s\S]*?<\/tr>)/i, `${hero}$1`);
  }

  next = protectEmailAppearance(next);
  return { html: next, changed: next !== html, mode: next === html ? 'unchanged' : 'updated' };
}
