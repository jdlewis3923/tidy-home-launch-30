/**
 * Tidy — every individual Pro/applicant email built in code, in one place.
 *
 * Each builder returns { subject, html, text } so the admin Send menu can
 * preview it, send it, or copy plain text for pasting into a text message.
 * lang: 'both' = English above Spanish (default), 'en' or 'es' = one language.
 *
 * All HTML goes through tidyEmailShell (light mode, official logo, service
 * strip, focal art). Copy rules: independent contractors, never "employees";
 * Tidy provides, the Pro chooses.
 */
import { tidyEmailShell, emailButton, pickEmailArt, TIDY_OWNER_EMAIL, TIDY_SITE } from './email-brand.ts';
import { CONTRACTOR_VISIT_PAY, CONTRACTOR_SHINE_PAY } from './pricing-canon.ts';
import { kitContentsLine, kitServiceKey } from './pro-kit.ts';

export type Lang = 'both' | 'en' | 'es';
export type Built = { subject: string; html: string; text: string };

export const PHOTO_RETAKE_REASONS = {
  too_dark: { en: 'The photo is too dark.', es: 'La foto está muy oscura.' },
  too_far: { en: 'You are too far from the camera.', es: 'Está muy lejos de la cámara.' },
  background: { en: 'The background is busy — use a plain light wall.', es: 'El fondo tiene muchas cosas — use una pared clara y lisa.' },
  hat_sunglasses: { en: 'Please remove the hat or sunglasses.', es: 'Quítese la gorra o las gafas de sol.' },
  blurry: { en: 'The photo is blurry.', es: 'La foto está borrosa.' },
  not_facing: { en: 'Please face the camera straight on.', es: 'Mire directamente a la cámara.' },
} as const;
export type RetakeReason = keyof typeof PHOTO_RETAKE_REASONS;

export const PHOTO_DO = [
  ['Wear your Tidy polo, or a plain solid shirt', 'Use su polo de Tidy, o una camisa lisa de un solo color'],
  ['Stand in front of a plain light wall, about two feet back', 'Párese frente a una pared clara y lisa, a unos dos pies de distancia'],
  ['Face the camera straight on, shoulders square', 'Mire de frente a la cámara, con los hombros derechos'],
  ['Head and shoulders, centered', 'Cabeza y hombros, centrados'],
  ['Natural light, facing a window', 'Luz natural, mirando hacia una ventana'],
  ['Phone at eye level, or have someone take it', 'El teléfono a la altura de los ojos, o que otra persona la tome'],
  ['A normal, friendly expression', 'Una expresión normal y amable'],
] as const;
export const PHOTO_DONT = [
  ['No hats, sunglasses or headphones', 'Sin gorras, gafas de sol ni audífonos'],
  ['No filters', 'Sin filtros'],
  ['No other people in the photo', 'Sin otras personas en la foto'],
  ['Not inside a car', 'No dentro de un carro'],
  ['Not in harsh sun', 'No bajo sol fuerte'],
  ['No busy background — no furniture, signs or doorways', 'Sin fondo recargado — sin muebles, letreros ni puertas'],
  ['Not shot from below', 'No tomada desde abajo'],
  ['Not a group photo you cropped yourself out of', 'No una foto de grupo recortada'],
] as const;
export const PHOTO_ORIGINAL = ['Send the original photo, not a screenshot, so it stays sharp in print.', 'Envíe la foto original, no una captura de pantalla, para que se imprima nítida.'] as const;
export const PHOTO_PURPOSE = [
  'It appears on your Tidy badge with your first name, last initial and Pro number. It is never used in advertising, and the badge is deactivated if you leave.',
  'Aparece en su credencial de Tidy con su nombre, la inicial de su apellido y su número de Pro. Nunca se usa en publicidad, y la credencial se desactiva si usted se va.',
] as const;

const P = 'margin:0 0 12px;font:15px/1.6 Arial,sans-serif;color:#334155';
const PS = 'margin:0 0 14px;font:14px/1.6 Arial,sans-serif;color:#64748b';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function para(lang: Lang, en: string, es: string): string {
  if (lang === 'en') return `<p style="${P}">${en}</p>`;
  if (lang === 'es') return `<p style="${P}">${es}</p>`;
  return `<p style="${P};margin-bottom:4px">${en}</p><p style="${PS}">${es}</p>`;
}
const pick = (lang: Lang, en: string, es: string) => (lang === 'es' ? es : lang === 'en' ? en : `${en} / ${es}`);
const txt = (lang: Lang, en: string, es: string) => (lang === 'es' ? es : lang === 'en' ? en : `${en}\n${es}`);

function list(lang: Lang, items: readonly (readonly [string, string])[], color: string, bg: string, mark: string, title: [string, string]) {
  const li = items.map(([en, es]) => `<tr><td valign="top" style="padding:4px 8px 4px 0;font:700 14px Arial;color:${color}">${mark}</td><td style="padding:4px 0;font:14px/1.5 Arial,sans-serif;color:#334155">${lang === 'es' ? es : en}${lang === 'both' ? `<br><span style="color:#64748b">${es}</span>` : ''}</td></tr>`).join('');
  return `<div style="margin:0 0 14px;padding:14px 16px;border-radius:12px;background:${bg};border:1px solid ${color}33"><p style="margin:0 0 6px;font:800 14px Arial,sans-serif;color:${color}">${pick(lang, title[0], title[1])}</p><table role="presentation" cellpadding="0" cellspacing="0">${li}</table></div>`;
}

export function photoRulesHtml(lang: Lang): string {
  return list(lang, PHOTO_DO, '#15803d', '#f0fdf4', '✓', ['Do', 'Sí']) +
    list(lang, PHOTO_DONT, '#b91c1c', '#fef2f2', '✕', ["Don't", 'No']) +
    para(lang, `<strong>${PHOTO_ORIGINAL[0]}</strong>`, PHOTO_ORIGINAL[1]) +
    para(lang, PHOTO_PURPOSE[0], PHOTO_PURPOSE[1]);
}
function photoRulesText(lang: Lang): string {
  const l = (items: readonly (readonly [string, string])[], m: string) => items.map(([en, es]) => `${m} ${lang === 'es' ? es : en}`).join('\n');
  return `${pick(lang, 'Do', 'Sí')}:\n${l(PHOTO_DO, '✓')}\n\n${pick(lang, "Don't", 'No')}:\n${l(PHOTO_DONT, '✕')}\n\n${txt(lang, PHOTO_ORIGINAL[0], PHOTO_ORIGINAL[1])}\n${txt(lang, PHOTO_PURPOSE[0], PHOTO_PURPOSE[1])}`;
}

function shell(lang: Lang, heading: string, bodyHtml: string, topic: string, cta?: { url: string; label: string }): string {
  return tidyEmailShell({
    heading,
    eyebrow: pick(lang, 'Tidy Pro', 'Tidy Pro'),
    previewText: heading,
    bodyHtml,
    ctaUrl: cta?.url,
    ctaLabel: cta?.label,
    art: pickEmailArt(topic),
    recipientContext: lang === 'es'
      ? 'Recibe este mensaje porque se está incorporando como contratista independiente de Tidy.'
      : 'You are receiving this because you are onboarding as an independent contractor with Tidy.',
  });
}
const help = (lang: Lang) => para(lang,
  `Questions: <a href="mailto:${TIDY_OWNER_EMAIL}" style="color:#2563eb">${TIDY_OWNER_EMAIL}</a>, Mon–Sat 8:00 AM–6:00 PM ET.`,
  `Preguntas: <a href="mailto:${TIDY_OWNER_EMAIL}" style="color:#2563eb">${TIDY_OWNER_EMAIL}</a>, lun–sáb 8:00 AM–6:00 PM ET.`);
const helpText = (lang: Lang) => txt(lang, `Questions: ${TIDY_OWNER_EMAIL}, Mon–Sat 8:00 AM–6:00 PM ET.`, `Preguntas: ${TIDY_OWNER_EMAIL}, lun–sáb 8:00 AM–6:00 PM ET.`);

// ---------------------------------------------------------------- contract
export function contractEmail(first: string, url: string, lang: Lang = 'both'): Built {
  const subject = pick(lang, `${first}, your Tidy contractor agreement is ready to sign`, `${first}, su contrato de Tidy está listo para firmar`);
  const html = shell(lang, subject,
    para(lang, 'Read the Independent Contractor Agreement, type your full legal name, tick the box and press Sign. About 5 minutes.',
      'Lea el Contrato de Contratista Independiente, escriba su nombre legal completo, marque la casilla y presione Firmar. Unos 5 minutos.') +
    para(lang, 'A signed copy is emailed to you right away.', 'Le enviamos una copia firmada de inmediato.') + help(lang),
    'contract agreement document', { url, label: pick(lang, 'Read and sign', 'Leer y firmar') });
  return { subject, html, text: `${subject}\n\n${txt(lang, 'Read and sign here:', 'Lea y firme aquí:')} ${url}\n\n${helpText(lang)}` };
}

export function contractSignedEmail(first: string, name: string, when: string, version: string, pdfUrl: string | null, lang: Lang = 'both'): Built {
  const subject = pick(lang, 'Your signed Tidy contractor agreement', 'Su contrato de Tidy firmado');
  const html = shell(lang, subject,
    para(lang, `Thanks, ${esc(first)}. Signed by <strong>${esc(name)}</strong> on ${when}. Version: ${esc(version)}.`,
      `Gracias, ${esc(first)}. Firmado por <strong>${esc(name)}</strong> el ${when}. Versión: ${esc(version)}.`) +
    para(lang, 'Keep this copy for your records. The download link works for 30 days.', 'Guarde esta copia. El enlace de descarga funciona por 30 días.') + help(lang),
    'contract signed document', pdfUrl ? { url: pdfUrl, label: pick(lang, 'Download signed copy', 'Descargar copia firmada') } : undefined);
  return { subject, html, text: `${subject}\n${name} · ${when} · ${version}\n${pdfUrl ?? ''}` };
}

// ---------------------------------------------------------------- badge photo
export function badgePhotoEmail(first: string, url: string, lang: Lang = 'both', retake?: RetakeReason | null): Built {
  const r = retake ? PHOTO_RETAKE_REASONS[retake] : null;
  const subject = r
    ? pick(lang, `${first}, one more badge photo please`, `${first}, otra foto para su credencial, por favor`)
    : pick(lang, `${first}, your Tidy badge photo`, `${first}, su foto para la credencial de Tidy`);
  const intro = r
    ? para(lang, `Thanks for the photo. We need one more: <strong>${r.en}</strong>`, `Gracias por la foto. Necesitamos otra: <strong>${r.es}</strong>`)
    : para(lang, 'Take one photo with your phone using the list below, then upload it. If your Tidy polo has not arrived yet, a plain solid shirt works.',
      'Tome una foto con su teléfono siguiendo la lista, y súbala. Si su polo de Tidy aún no ha llegado, una camisa lisa sirve.');
  const html = shell(lang, subject, intro + photoRulesHtml(lang) + help(lang), 'badge photo camera',
    { url, label: pick(lang, 'Upload your photo', 'Subir su foto') });
  const reasonText = r ? `${txt(lang, r.en, r.es)}\n\n` : '';
  return { subject, html, text: `${subject}\n\n${reasonText}${photoRulesText(lang)}\n\n${txt(lang, 'Upload:', 'Subir:')} ${url}` };
}

// ---------------------------------------------------------------- simple link emails
export function insuranceRequestEmail(first: string, url: string | null, lang: Lang = 'both'): Built {
  const subject = pick(lang, `${first}, upload your insurance certificate`, `${first}, suba su certificado de seguro`);
  const html = shell(lang, subject,
    para(lang, 'A commercial general liability policy, $1,000,000 per occurrence and $2,000,000 aggregate, listing Tidy Home Concierge LLC as Additional Insured. It must be active and verified before your first paid visit. Tidy reimburses up to $50 a month toward the premium for your first 3 months, paid with your Friday deposit once the certificate is verified.',
      'Una póliza de responsabilidad civil comercial, $1,000,000 por incidente y $2,000,000 en agregado, con Tidy Home Concierge LLC como Asegurado Adicional. Debe estar activa y verificada antes de su primera visita pagada. Tidy le reembolsa hasta $50 al mes de la prima durante los primeros 3 meses, con su depósito del viernes, una vez verificado el certificado.') + help(lang),
    'insurance certificate document', url ? { url, label: pick(lang, 'Upload your certificate', 'Subir su certificado') } : undefined);
  return { subject, html, text: `${subject}\n${url ?? ''}` };
}

export function backgroundCheckEmail(first: string, url: string | null, lang: Lang = 'both'): Built {
  const subject = pick(lang, `${first}, your background check`, `${first}, su verificación de antecedentes`);
  const body = url
    ? para(lang, 'We pay for it. Checkr collects everything itself — Tidy never sees those details.', 'Nosotros lo pagamos. Checkr recoge los datos; Tidy nunca los ve.')
    : para(lang, 'Checkr will email you the invitation directly. Nothing for you to do yet.', 'Checkr le enviará la invitación directamente. No tiene que hacer nada todavía.');
  const html = shell(lang, subject, body + help(lang), 'background check shield',
    url ? { url, label: pick(lang, 'Start the background check', 'Comenzar la verificación') } : undefined);
  return { subject, html, text: `${subject}\n${url ?? txt(lang, 'Checkr will email you directly.', 'Checkr le escribirá directamente.')}` };
}

export function declineEmail(first: string, lang: Lang = 'both'): Built {
  const subject = pick(lang, 'An update on your Tidy application', 'Una actualización sobre su solicitud en Tidy');
  const html = shell(lang, subject,
    para(lang, `Hi ${esc(first)}, thank you for your time and interest in working with Tidy. We are not moving forward with your application right now.`,
      `Hola ${esc(first)}, gracias por su tiempo e interés en trabajar con Tidy. Por ahora no vamos a continuar con su solicitud.`) +
    para(lang, 'We keep your details on file and may reach out when new routes open in your area.', 'Guardamos sus datos y podríamos contactarle cuando abran nuevas rutas en su zona.') + help(lang),
    'hiring handshake');
  return { subject, html, text: `${subject}\n\n${txt(lang, `Hi ${first}, thank you for your interest. We are not moving forward with your application right now.`, `Hola ${first}, gracias por su interés. Por ahora no vamos a continuar con su solicitud.`)}` };
}

// ---------------------------------------------------------------- five-item status
export type FiveKey = 'background' | 'insurance' | 'contract' | 'intake' | 'photo';
export const FIVE_LABEL: Record<FiveKey, [string, string]> = {
  background: ['Background check cleared', 'Verificación de antecedentes aprobada'],
  insurance: ['Insurance on file', 'Seguro registrado'],
  contract: ['Agreement signed', 'Contrato firmado'],
  intake: ['Sizes received', 'Tallas recibidas'],
  photo: ['Photo approved', 'Foto aprobada'],
};
export const FIVE_TODO: Record<FiveKey, [string, string, string, string]> = {
  background: ['Finish your background check', 'Complete su verificación de antecedentes', 'Start the background check', 'Comenzar la verificación'],
  insurance: ['Upload your insurance certificate', 'Suba su certificado de seguro', 'Upload your certificate', 'Subir su certificado'],
  contract: ['Sign your contractor agreement', 'Firme su contrato de contratista', 'Read and sign', 'Leer y firmar'],
  intake: ['Send your sizes', 'Envíe sus tallas', 'Send your sizes', 'Enviar sus tallas'],
  photo: ['Send your badge photo', 'Envíe su foto para la credencial', 'Upload your photo', 'Subir su foto'],
};

function payTable(service: string | null, lang: Lang): { html: string; text: string } {
  const key = kitServiceKey(service);
  const th = 'padding:8px;font:700 12px Arial,sans-serif;color:#475569;background:#f4f8fc;text-align:left';
  const td = 'padding:8px;font:14px Arial,sans-serif;color:#0f172a;border-top:1px solid #e6edf5';
  const sizes = [1, 2, 3] as const;
  const sizeName = (s: number) => pick(lang, ['Small', 'Medium', 'Large'][s - 1], ['Pequeña', 'Mediana', 'Grande'][s - 1]);
  if (key === 'car') {
    const rows = sizes.map((s) => `<tr><td style="${td}">${sizeName(s)}</td><td style="${td}">$${CONTRACTOR_SHINE_PAY[s].maintenanceWash}</td><td style="${td}">$${CONTRACTOR_SHINE_PAY[s].fullDetail}</td></tr>`).join('');
    return {
      html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6edf5;border-radius:10px;margin:0 0 14px"><tr><th style="${th}">${pick(lang, 'Size', 'Tamaño')}</th><th style="${th}">${pick(lang, 'Maintenance wash', 'Lavado de mantenimiento')}</th><th style="${th}">${pick(lang, 'Full detail', 'Detallado completo')}</th></tr>${rows}</table>`,
      text: sizes.map((s) => `${sizeName(s)}: $${CONTRACTOR_SHINE_PAY[s].maintenanceWash} / $${CONTRACTOR_SHINE_PAY[s].fullDetail}`).join('\n'),
    };
  }
  const svc = key === 'lawn' ? 'lawn' : 'cleaning';
  const t = CONTRACTOR_VISIT_PAY[svc];
  const rows = sizes.map((s) => `<tr><td style="${td}">${sizeName(s)}</td><td style="${td}">$${t[s].monthly}</td><td style="${td}">$${t[s].biweekly}</td><td style="${td}">$${t[s].weekly}</td></tr>`).join('');
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6edf5;border-radius:10px;margin:0 0 14px"><tr><th style="${th}">${pick(lang, 'Home size', 'Tamaño')}</th><th style="${th}">${pick(lang, 'Monthly plan', 'Plan mensual')}</th><th style="${th}">${pick(lang, 'Every 2 weeks', 'Cada 2 semanas')}</th><th style="${th}">${pick(lang, 'Weekly', 'Semanal')}</th></tr>${rows}</table>`,
    text: sizes.map((s) => `${sizeName(s)}: $${t[s].monthly} / $${t[s].biweekly} / $${t[s].weekly}`).join('\n'),
  };
}

export function allSetEmail(a: { first: string; pro_number: string | null; service: string | null; expected_delivery: string | null }, lang: Lang = 'both'): Built {
  const subject = pick(lang, `You're all set, ${a.first} — here's what happens next`, `Todo listo, ${a.first} — esto es lo que sigue`);
  const ticks = (Object.keys(FIVE_LABEL) as FiveKey[]).map((k) => `<tr><td style="padding:4px 8px 4px 0;font:800 15px Arial;color:#15803d">✓</td><td style="padding:4px 0;font:14px Arial,sans-serif;color:#0f172a">${pick(lang, FIVE_LABEL[k][0], FIVE_LABEL[k][1])}</td></tr>`).join('');
  const pay = payTable(a.service, lang);
  const when = a.expected_delivery ?? pick(lang, 'we will email the date as soon as it ships', 'le enviaremos la fecha en cuanto se envíe');
  const kitEn = kitContentsLine(a.service, 'en');
  const kitEs = kitContentsLine(a.service, 'es');
  const num = a.pro_number ?? '—';
  const body =
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px">${ticks}</table>` +
    `<div style="margin:0 0 16px;padding:16px;border-radius:12px;background:#fffbe6;border:1px solid #f5c51855;text-align:center"><p style="margin:0;font:700 12px Arial;color:#8a6d00;letter-spacing:.12em">${pick(lang, 'YOUR PRO NUMBER', 'SU NÚMERO DE PRO')}</p><p style="margin:6px 0 0;font:900 28px Arial;color:#0f172a">${num}</p></div>` +
    para(lang, "It's printed on your badge, it's how Justin identifies you in the schedule, and customers can scan the badge QR to confirm you're an active Tidy Pro.",
      'Está impreso en su credencial, así lo identifica Justin en el horario, y los clientes pueden escanear el QR de la credencial para confirmar que es un Pro activo de Tidy.') +
    para(lang, `<strong>What's arriving:</strong> ${kitEn}, shipped to your address. Expected: ${when}.`, `<strong>Lo que llega:</strong> ${kitEs}, enviado a su dirección. Fecha estimada: ${when}.`) +
    para(lang, '<strong>Your first route:</strong> Justin sends the schedule with addresses, day and time windows. The same homes every visit. A walkaround before you start and a check before you leave.',
      '<strong>Su primera ruta:</strong> Justin le envía el horario con direcciones, día y franja horaria. Las mismas casas cada visita. Un recorrido antes de empezar y una revisión antes de irse.') +
    para(lang, '<strong>Pay:</strong> per job, sized by the home, paid every Friday for every job finished that week.', '<strong>Pago:</strong> por trabajo, según el tamaño de la casa, cada viernes por cada trabajo terminado esa semana.') +
    pay.html +
    para(lang, '<strong>Insurance reimbursement:</strong> up to $50 a month for your first three months, added to your Friday deposit, starting with the first one.',
      '<strong>Reembolso del seguro:</strong> hasta $50 al mes durante sus primeros tres meses, sumado a su depósito del viernes, desde el primero.') +
    help(lang);
  const html = shell(lang, subject, body, 'welcome sparkle');
  const text = `${subject}\n\n${(Object.keys(FIVE_LABEL) as FiveKey[]).map((k) => `✓ ${pick(lang, FIVE_LABEL[k][0], FIVE_LABEL[k][1])}`).join('\n')}\n\n${pick(lang, 'Pro number', 'Número de Pro')}: ${num}\n${txt(lang, `Arriving: ${kitEn}. Expected: ${when}.`, `Llega: ${kitEs}. Fecha: ${when}.`)}\n\n${pay.text}\n\n${helpText(lang)}`;
  return { subject, html, text };
}

export function missingEmail(first: string, missing: { key: FiveKey; url: string | null }[], lang: Lang = 'both'): Built {
  const n = missing.length;
  const subject = pick(lang, `${first}, ${n === 1 ? 'one thing' : `${n} things`} left before your first route`, `${first}, ${n === 1 ? 'queda una cosa' : `quedan ${n} cosas`} antes de su primera ruta`);
  const blocks = missing.map((m, i) => {
    const t = FIVE_TODO[m.key];
    const btn = m.url ? emailButton(m.url, pick(lang, t[2], t[3])) : para(lang, 'On its way — nothing to do yet.', 'En camino — nada que hacer todavía.');
    const extra = m.key === 'photo' ? photoRulesHtml(lang) : '';
    return `<div style="margin:0 0 16px;padding:16px;border:1px solid #e2e8f0;border-radius:12px"><p style="margin:0 0 6px;font:800 16px Arial,sans-serif;color:#0f172a">${i + 1}. ${pick(lang, t[0], t[1])}</p>${extra}${btn}</div>`;
  }).join('');
  const html = shell(lang, subject, blocks + help(lang), 'reminder checklist');
  const text = `${subject}\n\n${missing.map((m, i) => `${i + 1}. ${pick(lang, FIVE_TODO[m.key][0], FIVE_TODO[m.key][1])}: ${m.url ?? ''}`).join('\n')}`;
  return { subject, html, text };
}

export const SITE = TIDY_SITE;
