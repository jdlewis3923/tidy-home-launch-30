/**
 * Tidy's single email design system — light mode only.
 *
 * All code-generated email is normalized through ensureTidyEmailBranding() in
 * brevo-send.ts. Provider-hosted templates are lightened + given hero art by
 * brandHostedTemplate(). Markup is table-based and inline-styled for broad
 * email-client support. No dark panels anywhere.
 */

export const TIDY_SITE = 'https://jointidy.co';
export const TIDY_LOGO = `${TIDY_SITE}/favicon-512x512.png`;
export const TIDY_OWNER_EMAIL = 'hello@jointidy.co';
export const TIDY_EMAIL_MARKER = 'data-tidy-email="branded"';
export const TIDY_ART_MARKER = 'data-tidy-hero-art="true"';

export interface TidyEmailArt {
  icon: string;
  label: string;
  tintFrom: string;
  tintTo: string;
}

const ART: Array<{ match: RegExp; art: TidyEmailArt }> = [
  { match: /(background check|checkr|screening)/i, art: { icon: '🛡️', label: 'Background check', tintFrom: '#eef4ff', tintTo: '#f8fbff' } },
  { match: /(insurance|coi|certificate|liability)/i, art: { icon: '📄', label: 'Insurance', tintFrom: '#eef7f2', tintTo: '#f9fdfb' } },
  { match: /(kit|uniform|polo|badge|magnet|shirt|size)/i, art: { icon: '👕', label: 'Your Tidy kit', tintFrom: '#fff7e0', tintTo: '#fffdf6' } },
  { match: /(visit|appointment|schedule|booking|arriv|reschedul)/i, art: { icon: '🗓️', label: 'Your visit', tintFrom: '#eef4ff', tintTo: '#f9fbff' } },
  { match: /(clean)/i, art: { icon: '🧼', label: 'Cleaning', tintFrom: '#eef6ff', tintTo: '#f9fcff' } },
  { match: /(lawn|yard|mow)/i, art: { icon: '🌿', label: 'Lawn', tintFrom: '#eff8ed', tintTo: '#fafdf9' } },
  { match: /(car care|shine complete|detail)/i, art: { icon: '🚗', label: 'Car Care', tintFrom: '#eef3fb', tintTo: '#fafcff' } },
  { match: /(payment|invoice|receipt|billing|payout|deposit|card)/i, art: { icon: '💳', label: 'Billing', tintFrom: '#f3f1ff', tintTo: '#fbfaff' } },
  { match: /(review|rating|feedback|star)/i, art: { icon: '⭐', label: 'Your feedback', tintFrom: '#fff6de', tintTo: '#fffdf5' } },
  { match: /(referral|refer a|friend|credit)/i, art: { icon: '🎁', label: 'Referrals', tintFrom: '#fdf0f6', tintTo: '#fffafd' } },
  { match: /(applicant|apply|hiring|interview|offer|candidate)/i, art: { icon: '🤝', label: 'Hiring', tintFrom: '#eef4ff', tintTo: '#f9fbff' } },
  { match: /(digest|report|summary|kpi|weekly|metrics)/i, art: { icon: '📊', label: 'Your snapshot', tintFrom: '#eef6f9', tintTo: '#fafdfe' } },
  { match: /(alert|urgent|failed|attention|issue|action required)/i, art: { icon: '🔔', label: 'Needs a look', tintFrom: '#fff1ec', tintTo: '#fffbf9' } },
  { match: /(password|sign in|log in|verify|confirm your email|account)/i, art: { icon: '🔐', label: 'Your account', tintFrom: '#eef2fb', tintTo: '#fafbff' } },
  { match: /(welcome|onboard|getting started|next step)/i, art: { icon: '✨', label: 'Welcome to Tidy', tintFrom: '#fff8e3', tintTo: '#fffdf7' } },
];

const DEFAULT_ART: TidyEmailArt = { icon: '🏡', label: 'Tidy Home Concierge', tintFrom: '#eef4ff', tintTo: '#fafcff' };

/** Pick a relevant hero illustration for an email based on its subject/heading. */
export function pickEmailArt(topic?: string): TidyEmailArt {
  if (!topic) return DEFAULT_ART;
  for (const entry of ART) if (entry.match.test(topic)) return entry.art;
  return DEFAULT_ART;
}

export function emailHeroArt(art: TidyEmailArt): string {
  return `<tr ${TIDY_ART_MARKER}><td align="center" style="background:${art.tintTo};background-image:linear-gradient(160deg,${art.tintFrom},${art.tintTo});padding:26px 24px 22px;border-bottom:1px solid #e9eff7">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" width="88" height="88" style="width:88px;height:88px;background:#ffffff;border-radius:44px;font:38px/88px Arial,sans-serif;text-align:center;box-shadow:0 6px 18px rgba(15,23,42,0.08)">${art.icon}</td></tr></table>
    <p style="margin:12px 0 0;font:700 11px Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:#64748b">${art.label}</p>
  </td></tr>`;
}

export interface TidyEmailShellOptions {
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td bgcolor="#FCCC00" style="background:#FCCC00;border-radius:9px"><a href="${url}" style="display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#0f172a;text-decoration:none">${label} &rarr;</a></td></tr></table>`;
}

export function emailServiceStrip(): string {
  const service = (icon: string, label: string) => `<td width="33.33%" align="center" style="padding:13px 5px"><span style="display:inline-block;width:28px;height:28px;border-radius:14px;background:#f4f8fc;font:16px/28px Arial,sans-serif;text-align:center;vertical-align:middle">${icon}</span><span style="padding-left:7px;font:700 11px Arial,sans-serif;color:#334155;vertical-align:middle">${label}</span></td>`;
  return `<tr><td style="background:#ffffff;border-bottom:1px solid #e6edf5;padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${service('🧼', 'Cleaning')}${service('🌿', 'Lawn')}${service('🚗', 'Car Care')}</tr></table></td></tr>`;
}

export function tidyEmailShell(opts: TidyEmailShellOptions): string {
  const preview = opts.previewText ?? opts.heading ?? 'A message from Tidy Home Concierge';
  const art = opts.art ?? pickEmailArt(opts.artTopic ?? `${opts.heading ?? ''} ${opts.eyebrow ?? ''} ${opts.previewText ?? ''}`);
  const heading = opts.heading
    ? `<h1 style="margin:0 0 16px;font:800 25px/1.2 Arial,sans-serif;color:#0f172a">${opts.heading}</h1>`
    : '';
  const cta = opts.ctaUrl ? emailButton(opts.ctaUrl, opts.ctaLabel ?? 'Open Tidy') : '';
  const context = opts.recipientContext
    ? `<br><span style="color:#8494a8">${opts.recipientContext}</span>`
    : '';

  return `<!doctype html><html lang="en" ${TIDY_EMAIL_MARKER}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${opts.heading ?? 'Tidy Home Concierge'}</title></head><body style="margin:0;padding:0;background:#f6f9fc;-webkit-text-size-adjust:100%;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f6f9fc">${preview}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc"><tr><td align="center" style="padding:28px 12px 36px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e9eff7;border-radius:14px;overflow:hidden">
    <tr><td style="background:#ffffff;padding:18px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><a href="${TIDY_SITE}"><img src="${TIDY_LOGO}" alt="Tidy Home Concierge" width="46" height="46" style="display:block;width:46px;height:46px;border:0"></a></td><td valign="middle" align="right" style="font:700 13px/1.35 Arial,sans-serif;color:#0f172a">More life.<br><span style="color:#b48a00">Less chores.</span></td></tr></table></td></tr>
    <tr><td style="height:4px;background:#FCCC00;font-size:0;line-height:0">&nbsp;</td></tr>
    ${emailServiceStrip()}
    ${emailHeroArt(art)}
    <tr><td style="padding:28px 28px 30px">${opts.eyebrow ? `<p style="margin:0 0 8px;font:700 11px Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;color:#2563eb">${opts.eyebrow}</p>` : ''}${heading}<div style="font:15px/1.65 Arial,sans-serif;color:#475569">${opts.bodyHtml}</div>${cta}</td></tr>
    <tr><td style="background:#f7fafd;border-top:1px solid #e6edf5;padding:20px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><img src="${TIDY_LOGO}" alt="Tidy" width="32" height="32" style="display:block;width:32px;height:32px;border:0"></td><td align="right" style="font:11px/1.65 Arial,sans-serif;color:#5b6b80">Tidy Home Concierge LLC<br>2121 Biscayne Blvd #1562, Miami, FL 33137<br><a href="${TIDY_SITE}" style="color:#5b6b80">jointidy.co</a> · (786) 829-1141${context}</td></tr></table></td></tr>
  </table></td></tr></table></body></html>`;
}

export function ensureTidyEmailBranding(html: string, subject?: string): string {
  if (html.includes(TIDY_EMAIL_MARKER)) return html;
  return tidyEmailShell({
    heading: subject,
    previewText: subject,
    bodyHtml: html,
    artTopic: `${subject ?? ''} ${html.slice(0, 400)}`,
  });
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
  if (
    html.includes(TIDY_EMAIL_MARKER) &&
    html.includes(TIDY_LOGO) &&
    html.includes('data-tidy-service-strip') &&
    html.includes(TIDY_ART_MARKER) &&
    !/(background(?:-color)?\s*:\s*#(?:0f172a|0b1220|111827|1e293b)|bgcolor\s*=\s*"#(?:0f172a|0b1220|111827|1e293b)")/i.test(html)
  ) {
    return { html, changed: false, mode: 'unchanged' };
  }

  let next = lightenEmailHtml(
    html
      .split('https://raw.githubusercontent.com/jdlewis3923/tidy-home-launch-30/main/tidy-logo-circle.png').join(TIDY_LOGO)
      .replace(/<html(?![^>]*data-tidy-email)/i, `<html ${TIDY_EMAIL_MARKER}`),
  );

  const strip = emailServiceStrip().replace('<tr>', '<tr data-tidy-service-strip="true">');
  const hero = emailHeroArt(art);

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
    next = next.replace(/(<tr data-tidy-service-strip="true">[\s\S]*?<\/tr>)/i, `$1${hero}`);
  }

  return { html: next, changed: next !== html, mode: next === html ? 'unchanged' : 'updated' };
}
