/**
 * Lifecycle email renderer: turns a stored lifecycle template into the Tidy shell.
 * - first <h1> becomes the styled heading (subject is never repeated as a second heading)
 * - the last link paragraph becomes the gold CTA button
 * - tokens the template mentions become icon fact tiles (date, plan, price, area...)
 * - hero photo is picked from the template key + subject
 */
import { tidyEmailShell, type TidyEmailFact, type TidyEmailIcon } from './email-brand.ts';

type Tokens = Record<string, unknown>;

const FACTS: Array<{ token: string; icon: TidyEmailIcon; en: string; es: string; fmt?: (v: string) => string }> = [
  { token: 'launch', icon: 'calendar-days', en: 'First visits', es: 'Primeras visitas' },
  { token: 'convert_date', icon: 'credit-card', en: 'Payment opens', es: 'Pago disponible' },
  { token: 'deadline', icon: 'clock', en: 'Respond by', es: 'Responde antes del' },
  { token: 'founding_number', icon: 'hash', en: 'Founding Home', es: 'Hogar Fundador', fmt: (v) => `#${v}` },
  { token: 'plan', icon: 'sparkles', en: 'Your plan', es: 'Tu plan' },
  { token: 'price_month', icon: 'tag', en: 'Monthly', es: 'Mensual', fmt: (v) => `${v}${/mo/.test(v) ? '' : '/mo'}` },
  { token: 'size', icon: 'ruler', en: 'Lawn size', es: 'Tamaño del césped' },
  { token: 'sqft', icon: 'leaf', en: 'Turf area', es: 'Área de césped', fmt: (v) => `${v} sq ft` },
  { token: 'zip_name', icon: 'map-pin', en: 'Neighborhood', es: 'Vecindario' },
  { token: 'wait_position', icon: 'hash', en: 'Waitlist spot', es: 'Lugar en lista', fmt: (v) => `#${v}` },
  { token: 'spots_left', icon: 'house', en: 'Spots left', es: 'Lugares libres' },
];

const fill = (t: string, tk: Tokens) => t.replace(/\{(\w+)\}/g, (m, k) => (tk[k] != null && tk[k] !== '' ? String(tk[k]) : m));

export function renderLifecycleEmail(opts: {
  rawBody: string; rawSubject: string; tokens: Tokens; templateKey: string; lang?: 'en' | 'es'; footerHtml?: string;
}): { html: string; subject: string } {
  const lang = opts.lang ?? 'en';
  const subject = fill(opts.rawSubject || 'Tidy', opts.tokens);
  let body = fill(opts.rawBody, opts.tokens);

  let heading: string | undefined;
  body = body.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/i, (_m, h) => { heading = h.trim(); return ''; });

  let ctaUrl: string | undefined; let ctaLabel: string | undefined;
  const ctaRe = /<p[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/p>(?![\s\S]*<p[^>]*>\s*<a)/i;
  body = body.replace(ctaRe, (_m, u, l) => { ctaUrl = u; ctaLabel = l.replace(/<[^>]+>/g, '').replace(/\s*(→|&rarr;)\s*$/, '').trim(); return ''; });

  // Style bare paragraphs and links so every client renders them the same.
  body = body
    .replace(/<p>/gi, '<p style="margin:0 0 14px">')
    .replace(/<a (?![^>]*style=)/gi, '<a style="color:#2563eb;font-weight:700" ')
    .replace(/<strong>/gi, '<strong class="tn" style="color:#0f172a">');

  const mentioned = `${opts.rawBody} ${opts.rawSubject}`;
  const facts: TidyEmailFact[] = [];
  for (const f of FACTS) {
    const v = opts.tokens[f.token];
    if (v == null || v === '' || !mentioned.includes(`{${f.token}}`)) continue;
    facts.push({ icon: f.icon, label: lang === 'es' ? f.es : f.en, value: f.fmt ? f.fmt(String(v)) : String(v) });
  }

  const html = tidyEmailShell({
    heading: heading ?? subject.replace(/^\[TEST\]\s*/, ''),
    previewText: subject.replace(/^\[TEST\]\s*/, ''),
    bodyHtml: body + (opts.footerHtml ?? ''),
    ctaUrl, ctaLabel,
    facts,
    artTopic: `${opts.templateKey.replace(/_/g, ' ')} ${subject} ${heading ?? ''}`,
  });
  return { html, subject };
}
