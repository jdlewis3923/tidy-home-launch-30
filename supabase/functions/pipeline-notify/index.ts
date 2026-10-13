import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * pipeline-notify — the ONLY sender of the 8-stage hiring messages (§5).
 * Called by the database at the exact moment each one belongs:
 *   proof_invite      Advance out of screened (or "Send proof link" on a migrated record): role one-pager + proof link
 *   proof_link        "Send proof link" resend when the one-pager already went out
 *   proof_reminder    one reminder 48h after the link with nothing submitted (pipeline_proof_tick)
 *   proof_rejected    an item was rejected: link that reopens only the rejected items
 *   agreement_docs    Advance out of proof: ICA + W-9 for e-signature (first document ever sent)
 *   insurance_instructions  right after WELCOME-T1 on signature
 *   cleared           checkr_result = clear saved at stage 6
 *   activation        Advance out of insured: badge photo guide + route, days, start date
 * Everything goes in the candidate's preferred_language, by SMS and email.
 * Service-role (database) or admin only.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import { loadFive, ensureContractToken } from '../_shared/pro-five.ts';
import { loadLaunchConfig } from '../_shared/launch-config.ts';
import type { BrevoAttachment } from '../_shared/brevo-send.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
const SITE = 'https://jointidy.co';

type Lang = 'en' | 'es';
const ROLE: Record<string, { en: string; es: string }> = {
  cleaning: { en: 'House Cleaning Pro', es: 'Pro de Limpieza de Casas' },
  lawn: { en: 'Lawn Care Pro', es: 'Pro de Cuidado del Césped' },
  car_care: { en: 'Car Care Pro', es: 'Pro de Cuidado del Auto' },
};
const DAY: Record<string, { en: string; es: string }> = {
  mon: { en: 'Monday', es: 'lunes' }, tue: { en: 'Tuesday', es: 'martes' }, wed: { en: 'Wednesday', es: 'miércoles' },
  thu: { en: 'Thursday', es: 'jueves' }, fri: { en: 'Friday', es: 'viernes' }, sat: { en: 'Saturday', es: 'sábado' }, sun: { en: 'Sunday', es: 'domingo' },
};
const REASON_ES: Record<string, string> = {
  'Card not in photo': 'La tarjeta no aparece en la foto',
  'Not the required item': 'No es el equipo requerido',
  "Not running / couldn't tell it works": 'No está funcionando / no se ve que funcione',
  'Blurry': 'La foto está borrosa',
  'Other': 'Otro motivo',
};

const e164 = (raw: string | null | undefined) => {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function docUrl(docKey: string, seconds = 7 * 86400): Promise<{ url: string; name: string } | null> {
  const { data } = await admin.from('company_documents').select('filename, storage_path').eq('doc_key', docKey)
    .eq('current_version', true).is('archived_at', null).order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const { data: s } = await admin.storage.from('company-docs').createSignedUrl(data.storage_path, seconds);
  return s?.signedUrl ? { url: s.signedUrl, name: data.filename } : null;
}
async function legacyDoc(pattern: string): Promise<{ url: string; name: string } | null> {
  const { data } = await admin.from('company_documents').select('filename, storage_path, doc_key').ilike('filename', pattern)
    .not('tags', 'cs', '{signed}').eq('current_version', true).is('archived_at', null).order('uploaded_at', { ascending: false }).limit(5);
  const row = (data ?? []).find((r) => r.doc_key !== 'ica:es' && !/^ICA-signed/i.test(r.filename));
  if (!row) return null;
  const { data: s } = await admin.storage.from('company-docs').createSignedUrl(row.storage_path, 7 * 86400);
  return s?.signedUrl ? { url: s.signedUrl, name: row.filename } : null;
}
async function dashboardWarning(title: string, key: string, applicantId: string) {
  await admin.from('admin_alerts').insert({
    alert_type: 'hiring_doc_missing', level: 'warning', category: 'hiring', tier: 'dashboard', title,
    body: 'Upload it on the Pipeline page under Hiring documents.', action_label: 'Open pipeline', action_url: '/admin/pipeline',
    dedupe_key: key, context: { applicant_id: applicantId },
  }).then(() => null, () => null);
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const { applicant_id, event, slot } = await req.json().catch(() => ({}));
  if (typeof applicant_id !== 'string' || typeof event !== 'string') return jsonResponse({ error: 'applicant_id and event required' }, 400);

  const { data: p } = await admin.from('contractor_pipeline').select('*').eq('applicant_id', applicant_id).maybeSingle();
  const { data: a } = await admin.from('applicants').select('id, first_name, email, phone, contract_token').eq('id', applicant_id).maybeSingle();
  if (!p || !a) return jsonResponse({ error: 'not_found' }, 404);
  if (p.archived) return jsonResponse({ ok: true, skipped: 'archived' });
  const lang: Lang = p.preferred_language === 'es' ? 'es' : 'en';
  const first = (a.first_name ?? '').trim() || (lang === 'es' ? 'hola' : 'there');
  const role = ROLE[p.service ?? 'cleaning'] ?? ROLE.cleaning;
  const proofUrl = p.proof_token ? `${SITE}/pro/proof/${p.proof_token}` : null;

  // Server re-check of the hiring order for each message.
  const stageOk: Record<string, boolean> = {
    proof_invite: p.stage === 'proof', proof_link: p.stage === 'proof', proof_reminder: p.stage === 'proof', proof_rejected: p.stage === 'proof',
    agreement_docs: p.stage === 'agreement' && !!p.proof_approved_at,
    insurance_instructions: !!p.proof_approved_at && ['agreement', 'ins_quote'].includes(p.stage),
    cleared: p.stage === 'background' && p.checkr_result === 'clear' && !!p.proof_approved_at,
    activation: p.stage === 'active' && !!p.proof_approved_at,
  };
  if (!(event in stageOk)) return jsonResponse({ error: 'unknown_event' }, 400);
  if (!stageOk[event]) {
    await admin.from('contractor_stage_events').insert({ applicant_id, kind: 'refused', from_stage: p.stage, to_stage: p.stage, reason: `message ${event} refused at stage ${p.stage}` });
    return jsonResponse({ ok: false, error: 'wrong_stage', stage: p.stage }, 409);
  }

  let sms = ''; let subject = ''; let html = ''; const attachment: BrevoAttachment[] = []; let extraSms = '';

  if (event === 'proof_invite' || event === 'proof_link' || event === 'proof_reminder') {
    if (!proofUrl) return jsonResponse({ error: 'no_proof_token' }, 409);
    if (event === 'proof_invite') {
      let doc = await docUrl(`one_pager:${p.service}:${lang}`);
      if (!doc && lang === 'es') {
        doc = await docUrl(`one_pager:${p.service}:en`);
        await dashboardWarning(`Spanish one-pager missing for ${role.en}`, `one_pager_es_missing:${p.service}`, applicant_id);
      }
      if (!doc) await dashboardWarning(`One-pager missing for ${role.en} — ${a.first_name ?? 'a candidate'} got the proof link without it`, `one_pager_missing:${p.service}:${applicant_id}`, applicant_id);
      if (doc) { attachment.push({ url: doc.url, name: doc.name }); extraSms = lang === 'es' ? `\nDetalles del puesto: ${doc.url}` : `\nRole details: ${doc.url}`; }
      sms = lang === 'es'
        ? `Hola ${first}, soy Justin de Tidy. Gracias por la llamada. Siguiente paso: muéstranos tu equipo. Toma unos 10 minutos desde tu teléfono: ${proofUrl}. Adjunto los detalles del puesto. Todavía no hay nada que firmar.`
        : `Hi ${first}, it's Justin from Tidy. Great talking with you. Next step: show us your equipment. It takes about 10 minutes on your phone: ${proofUrl}. The role details are attached. Nothing to sign yet.`;
      subject = lang === 'es' ? `Siguiente paso: muéstranos tu equipo — ${role.es}` : `Next step: show us your equipment — ${role.en}`;
    } else if (event === 'proof_link') {
      sms = lang === 'es'
        ? `Hola ${first}, soy Justin de Tidy. Aquí está tu enlace para mostrar tu equipo (unos 10 minutos desde tu teléfono): ${proofUrl}. Todavía no hay nada que firmar.`
        : `Hi ${first}, it's Justin from Tidy. Here is your link to show us your equipment (about 10 minutes on your phone): ${proofUrl}. Nothing to sign yet.`;
      subject = lang === 'es' ? 'Tu enlace para mostrar tu equipo' : 'Your equipment proof link';
    } else {
      sms = lang === 'es'
        ? `Hola ${first}, soy Justin de Tidy. Recordatorio: muéstranos tu equipo aquí cuando puedas (unos 10 minutos): ${proofUrl}`
        : `Hi ${first}, it's Justin from Tidy. Reminder: show us your equipment here when you can (about 10 minutes): ${proofUrl}`;
      subject = lang === 'es' ? 'Recordatorio: muéstranos tu equipo' : 'Reminder: show us your equipment';
    }
    html = `<p>${esc(sms)}</p>`;
  } else if (event === 'proof_rejected') {
    if (!proofUrl) return jsonResponse({ error: 'no_proof_token' }, 409);
    const { data: it } = await admin.from('pipeline_proof_items').select('reject_reason, reject_note').eq('applicant_id', applicant_id).eq('slot', slot ?? '').maybeSingle();
    const reason = it?.reject_reason ? (lang === 'es' ? REASON_ES[it.reject_reason] ?? it.reject_reason : it.reject_reason) : '';
    const note = it?.reject_note ? ` (${it.reject_note})` : '';
    // Re-arm the link for 14 days; the page shows ONLY rejected items.
    await admin.from('contractor_pipeline').update({ proof_token_expires_at: new Date(Date.now() + 14 * 86400_000).toISOString() }).eq('applicant_id', applicant_id);
    sms = lang === 'es'
      ? `Hola ${first}, soy Justin de Tidy. Necesitamos una foto o video nuevo: ${reason}${note}. Ábrelo aquí; solo aparece lo que falta: ${proofUrl}`
      : `Hi ${first}, it's Justin from Tidy. We need one new photo or video: ${reason}${note}. Open it here; only what's needed is shown: ${proofUrl}`;
    subject = lang === 'es' ? 'Necesitamos una foto o video nuevo' : 'We need one new photo or video';
    html = `<p>${esc(sms)}</p>`;
  } else if (event === 'agreement_docs') {
    const token = await ensureContractToken(admin, a);
    const link = `${SITE}/contract/${token}`;
    let ica = lang === 'es' ? await docUrl('ica:es') : null;
    if (lang === 'es' && !ica) await dashboardWarning('Spanish ICA not on file. Spanish-speaking candidates are signing the English version.', 'ica_es_missing', applicant_id);
    if (!ica) ica = await legacyDoc('%IndependentContractorAgreement%');
    const w9 = await legacyDoc('%W-9%') ?? await legacyDoc('%W9%');
    if (ica) attachment.push({ url: ica.url, name: ica.name });
    if (w9) attachment.push({ url: w9.url, name: w9.name });
    sms = lang === 'es'
      ? `Tu equipo está aprobado. Aquí está tu contrato de contratista y el W-9 para firmar: ${link}.`
      : `Your equipment is approved. Here is your contractor agreement and W-9 to sign: ${link}.`;
    subject = lang === 'es' ? 'Tu equipo está aprobado: contrato y W-9' : 'Your equipment is approved: agreement and W-9';
    html = `<p>${esc(sms)}</p>`;
  } else if (event === 'insurance_instructions') {
    sms = lang === 'es'
      ? `Hola ${first}, gracias por firmar. Siguiente paso: pide una COTIZACIÓN de seguro de responsabilidad general a Hiscox o NEXT: $1M por incidente / $2M total, con Tidy Home Concierge LLC como Asegurado Adicional. Envíanos la COTIZACIÓN; todavía no la compres. Responde a este mensaje con la cotización.`
      : `Hi ${first}, thanks for signing. Next step: get a general liability insurance QUOTE from Hiscox or NEXT: $1M per occurrence / $2M aggregate, with Tidy Home Concierge LLC as Additional Insured. Send us the QUOTE, don't buy yet. Reply to this message with the quote.`;
    subject = lang === 'es' ? 'Siguiente paso: cotización de seguro (todavía no la compres)' : "Next step: insurance quote (don't buy yet)";
    html = `<p>${esc(sms)}</p>`;
  } else if (event === 'cleared') {
    const five = await loadFive(admin, applicant_id, { mintTokens: true }).catch(() => null);
    const link = five?.urls.insurance ?? `${SITE}/pro/upload-coi`;
    sms = lang === 'es'
      ? `Ya estás aprobado. Compra la póliza que cotizaste y sube el certificado: ${link}.`
      : `You're cleared. Buy the policy you quoted and upload the certificate: ${link}.`;
    subject = lang === 'es' ? 'Ya estás aprobado: sube tu certificado de seguro' : "You're cleared: upload your insurance certificate";
    html = `<p>${esc(sms)}</p>`;
  } else if (event === 'activation') {
    const five = await loadFive(admin, applicant_id, { mintTokens: true }).catch(() => null);
    const badge = five?.urls.photo ?? `${SITE}/pro/login`;
    const cfg = await loadLaunchConfig(admin).catch(() => null);
    const scope = p.service === 'car_care' ? 'car_care' : p.service;
    const start = (cfg?.[scope as string] as { first_visit_date?: string } | undefined)?.first_visit_date ?? null;
    const days = (p.service_days ?? []).map((d: string) => DAY[d.slice(0, 3).toLowerCase()]?.[lang] ?? d).join(', ');
    const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const daysTxt = days || (lang === 'es' ? 'te los confirmamos esta semana' : "we'll confirm them this week");
    const startTxt = start ? fmt(start) : (lang === 'es' ? 'te la confirmamos esta semana' : "we'll confirm it this week");
    sms = lang === 'es'
      ? `Hola ${first}, ¡bienvenido a Tidy! Tu ruta: ${role.es}. Días: ${daysTxt}. Primer día: ${startTxt}. Sigue esta guía para la foto de tu credencial: ${badge}. Tu kit se envía después de esto.`
      : `Hi ${first}, welcome to Tidy! Your route: ${role.en}. Days: ${daysTxt}. Start date: ${startTxt}. Follow this guide for your badge photo: ${badge}. Your kit ships after this.`;
    subject = lang === 'es' ? 'Bienvenido a Tidy: tu ruta y la foto de tu credencial' : 'Welcome to Tidy: your route and badge photo';
    html = `<p>${esc(sms)}</p><p>${lang === 'es' ? 'Foto de credencial: fondo liso, sin gorra ni lentes oscuros, de frente, con buena luz.' : 'Badge photo: plain background, no hat or sunglasses, facing the camera, good light.'}</p>`;
  }

  // SMS (queued by send-twilio-sms outside the send window, never dropped).
  let smsResult: unknown = 'no_phone';
  const to = e164(a.phone);
  if (to) {
    const r = await vendorFetch(`${URL_}/functions/v1/send-twilio-sms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ to_phone_e164: to, body: sms + extraSms, idempotency_key: `pipeline:${event}:${applicant_id}:${slot ?? ''}:${new Date().toISOString().slice(0, 13)}`, template_name: `pipeline_${event}`, triggered_by: 'pipeline-notify' }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);
    smsResult = r.ok ? 'sent_or_queued' : `failed_${r.status}`;
  }
  let emailResult: unknown = 'no_email';
  if (a.email) {
    const built = { subject, html: tidyEmailShell({ heading: subject, previewText: subject, bodyHtml: html }) } as never;
    const res = await sendProEmail(admin, { applicantId: applicant_id, key: `pipeline_${event}`, to: a.email, name: a.first_name ?? undefined, built, triggeredBy: 'pipeline-notify', attachment: attachment.length ? attachment : undefined });
    emailResult = res.sent ? 'sent' : (res.reason ?? 'failed');
  }
  await admin.rpc('pipeline_mark_sent', { _id: applicant_id, _what: event });
  await admin.from('contractor_stage_events').insert({ applicant_id, kind: 'message', from_stage: p.stage, to_stage: p.stage,
    reason: `${event} sent (${lang})`, metadata: { event, lang, sms: smsResult, email: emailResult, attachments: attachment.map((x) => x.name) } });
  return jsonResponse({ ok: true, event, lang, sms: smsResult, email: emailResult });
});
