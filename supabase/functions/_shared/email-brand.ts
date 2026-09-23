/**
 * Tidy's single email design system.
 *
 * All code-generated email is normalized through ensureTidyEmailBranding() in
 * brevo-send.ts. Provider-hosted templates keep their own complete documents.
 * Markup is table-based and inline-styled for broad email-client support.
 */

export const TIDY_SITE = 'https://jointidy.co';
export const TIDY_LOGO = `${TIDY_SITE}/favicon-512x512.png`;
export const TIDY_OWNER_EMAIL = 'hello@jointidy.co';
export const TIDY_EMAIL_MARKER = 'data-tidy-email="branded"';

export interface TidyEmailShellOptions {
  heading?: string;
  eyebrow?: string;
  previewText?: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
  recipientContext?: string;
}

export function emailButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0"><tr><td bgcolor="#FCCC00" style="background:#FCCC00;border-radius:9px"><a href="${url}" style="display:inline-block;padding:13px 22px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#0f172a;text-decoration:none">${label} &rarr;</a></td></tr></table>`;
}

export function emailServiceStrip(): string {
  const service = (icon: string, label: string) => `<td width="33.33%" align="center" style="padding:13px 5px"><span style="display:inline-block;width:28px;height:28px;border-radius:14px;background:#f4f8fc;font:16px/28px Arial,sans-serif;text-align:center;vertical-align:middle">${icon}</span><span style="padding-left:7px;font:700 11px Arial,sans-serif;color:#334155;vertical-align:middle">${label}</span></td>`;
  return `<tr><td style="background:#ffffff;border-bottom:1px solid #e6edf5;padding:0 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${service('✦', 'Cleaning')}${service('♧', 'Lawn')}${service('◆', 'Car Care')}</tr></table></td></tr>`;
}

export function tidyEmailShell(opts: TidyEmailShellOptions): string {
  const preview = opts.previewText ?? opts.heading ?? 'A message from Tidy Home Concierge';
  const heading = opts.heading
    ? `<h1 style="margin:0 0 16px;font:800 25px/1.2 Arial,sans-serif;color:#0f172a">${opts.heading}</h1>`
    : '';
  const cta = opts.ctaUrl ? emailButton(opts.ctaUrl, opts.ctaLabel ?? 'Open Tidy') : '';
  const context = opts.recipientContext
    ? `<br><span style="color:#7c8ca0">${opts.recipientContext}</span>`
    : '';

  return `<!doctype html><html lang="en" ${TIDY_EMAIL_MARKER}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>${opts.heading ?? 'Tidy Home Concierge'}</title></head><body style="margin:0;padding:0;background:#eef2f7;-webkit-text-size-adjust:100%;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f7">${preview}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7"><tr><td align="center" style="padding:28px 12px 36px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#0f172a;padding:16px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle"><a href="${TIDY_SITE}"><img src="${TIDY_LOGO}" alt="Tidy Home Concierge" width="44" height="44" style="display:block;width:44px;height:44px;border:0"></a></td><td valign="middle" align="right" style="font:700 13px/1.35 Arial,sans-serif;color:#ffffff">More life.<br><span style="color:#FCCC00">Less chores.</span></td></tr></table></td></tr>
    <tr><td style="height:4px;background:#FCCC00;font-size:0;line-height:0">&nbsp;</td></tr>
    ${emailServiceStrip()}
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
  });
}

/** Upgrade a provider-hosted template in place without touching its subject or merge fields. */
export function brandHostedTemplate(html: string, heading: string): { html: string; changed: boolean; mode: 'updated' | 'wrapped' | 'unchanged' } {
  if (html.includes(TIDY_EMAIL_MARKER) && html.includes(TIDY_LOGO) && html.includes('data-tidy-service-strip')) {
    return { html, changed: false, mode: 'unchanged' };
  }

  let next = html
    .split('https://raw.githubusercontent.com/jdlewis3923/tidy-home-launch-30/main/tidy-logo-circle.png').join(TIDY_LOGO)
    .replace(/<html(?![^>]*data-tidy-email)/i, `<html ${TIDY_EMAIL_MARKER}`);

  const strip = emailServiceStrip().replace('<tr>', '<tr data-tidy-service-strip="true">');
  if (!next.includes('data-tidy-service-strip')) {
    if (next.includes('<!-- Hero banner -->')) {
      next = next.replace('<!-- Hero banner -->', `${strip}\n  <!-- Hero banner -->`);
    } else {
      const accent = /(<(?:div|tr)[^>]*background:\s*#(?:FCCC00|f5c518)[\s\S]*?<\/(?:div|tr)>)/i;
      if (accent.test(next)) next = next.replace(accent, `$1${strip}`);
      else {
        const body = next.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? next;
        return {
          html: tidyEmailShell({ heading, previewText: heading, bodyHtml: body }).replace('<tr><td style="background:#ffffff', '<tr data-tidy-service-strip="true"><td style="background:#ffffff'),
          changed: true,
          mode: 'wrapped',
        };
      }
    }
  }
  return { html: next, changed: next !== html, mode: next === html ? 'unchanged' : 'updated' };
}
