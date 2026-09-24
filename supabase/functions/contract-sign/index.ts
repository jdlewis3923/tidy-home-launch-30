import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — typed-signature contract flow for /contract/:token (public, token only).
 *
 * POST { token, action: 'document' }                       → { url, version, filename }
 * POST { token, action: 'sign', typed_name, agreed, version } → signs
 *
 * On sign: stores typed name, time, IP, browser and exact document version;
 * appends a signature page to the agreement PDF; saves it; emails a copy to the
 * Pro and to hello@jointidy.co; moves the stage to contract_signed (which
 * assigns the Pro number). Listed for lawyer review with the ICA items.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { vendorFetch } from '../_shared/http.ts';
import { contractSignedEmail } from '../_shared/pro-emails.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
import { TIDY_OWNER_EMAIL } from '../_shared/email-brand.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const BUCKET = 'company-docs';

async function currentIca() {
  const { data } = await admin.from('company_documents')
    .select('id, filename, storage_path, uploaded_at')
    .ilike('filename', '%ICA%').eq('current_version', true).is('archived_at', null)
    .order('uploaded_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  const version = `${data.filename} · ${String(data.uploaded_at).slice(0, 10)} · ${String(data.id).slice(0, 8)}`;
  return { ...data, version };
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  if (token.length < 20) return jsonResponse({ error: 'invalid_request' }, 400);

  const { data: a } = await admin.from('applicants')
    .select('id, first_name, last_name, email, contracts_signed, current_stage')
    .eq('contract_token', token).maybeSingle();
  if (!a) return jsonResponse({ error: 'not_found' }, 404);

  const doc = await currentIca();
  if (!doc) return jsonResponse({ error: 'no_agreement_on_file' }, 500);

  if (body.action === 'document') {
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 3600);
    return jsonResponse({ ok: true, url: s?.signedUrl ?? null, version: doc.version, filename: doc.filename, signed: a.contracts_signed === true });
  }

  if (body.action !== 'sign') return jsonResponse({ error: 'unknown_action' }, 400);
  if (a.contracts_signed) return jsonResponse({ ok: true, already: true });
  const typed = typeof body.typed_name === 'string' ? body.typed_name.trim().replace(/\s+/g, ' ') : '';
  if (typed.length < 3 || typed.length > 120 || !/\s/.test(typed)) return jsonResponse({ error: 'full_name_required' }, 400);
  if (body.agreed !== true) return jsonResponse({ error: 'must_agree' }, 400);
  if (body.version !== doc.version) return jsonResponse({ error: 'version_changed', version: doc.version }, 409);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || 'unknown';
  const ua = (req.headers.get('user-agent') ?? 'unknown').slice(0, 400);
  const signedAt = new Date();
  const whenEt = signedAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' }) + ' ET';

  // Signed PDF: original agreement + one signature page.
  const dl = await admin.storage.from(BUCKET).download(doc.storage_path);
  if (dl.error || !dl.data) return jsonResponse({ error: 'agreement_unavailable' }, 500);
  const pdf = await PDFDocument.load(new Uint8Array(await dl.data.arrayBuffer()));
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.06, 0.09, 0.16);
  let y = 720;
  const line = (t: string, f = font, size = 11) => { page.drawText(t.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ''), { x: 60, y, size, font: f, color: ink }); y -= size + 10; };
  line('Signature page / Página de firma', bold, 18); y -= 8;
  line('Independent Contractor Agreement — Tidy Home Concierge LLC', bold, 12); y -= 6;
  line(`Signed by / Firmado por: ${typed}`);
  line(`Date and time / Fecha y hora: ${whenEt} (${signedAt.toISOString()})`);
  line(`IP address / Dirección IP: ${ip}`);
  line(`Document version / Versión: ${doc.version}`);
  line(`Browser / Navegador: ${ua.slice(0, 90)}`, font, 9);
  y -= 10;
  line('The signer typed their full legal name and ticked "I have read and agree to this agreement."', font, 10);
  line('El firmante escribió su nombre legal completo y marcó "He leído y acepto este contrato."', font, 10);
  const bytes = await pdf.save();

  const path = `contracts/signed/${a.id}/ica-signed-${signedAt.getTime()}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false });
  if (up.error) return jsonResponse({ error: 'save_failed' }, 500);

  await admin.from('contract_signatures').insert({
    applicant_id: a.id, typed_name: typed, signed_at: signedAt.toISOString(), ip_address: ip,
    user_agent: ua, document_id: doc.id, document_version: doc.version, signed_pdf_path: path,
  });
  await admin.from('company_documents').insert({
    filename: `ICA-signed-${(a.first_name ?? '').trim()}-${(a.last_name ?? '').trim()}.pdf`,
    category: 'Contracts', tags: ['signed', 'ica', a.id], storage_path: path, mime_type: 'application/pdf',
    file_size_bytes: bytes.byteLength, current_version: true,
  });
  const advance = !['oriented', 'active'].includes(a.current_stage ?? '');
  await admin.from('applicants').update({
    contracts_signed: true, contracts_signed_at: signedAt.toISOString(), contract_signed_name: typed,
    contract_signed_ip: ip, contract_signed_ua: ua, contract_doc_version: doc.version,
    contract_signed_pdf_path: path, ...(advance ? { current_stage: 'contract_signed' } : {}),
  }).eq('id', a.id);
  await admin.from('onboarding_events').insert({ applicant_id: a.id, event: 'contract_signed', metadata: { version: doc.version, ip } });

  const { data: link } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  const first = a.first_name ?? 'there';
  const built = contractSignedEmail(first, typed, whenEt, doc.version, link?.signedUrl ?? null);
  const attachment = [{ name: 'Tidy-Contractor-Agreement-signed.pdf', content: toB64(bytes) }];
  if (a.email) await sendProEmail(admin, { applicantId: a.id, key: 'contract_signed', to: a.email, name: first, built, triggeredBy: 'contract-sign', attachment });
  await sendProEmail(admin, {
    applicantId: null, key: 'contract_signed_owner', to: TIDY_OWNER_EMAIL,
    built: { ...built, subject: `Signed: ${typed} — contractor agreement` }, triggeredBy: 'contract-sign', attachment,
  });

  await vendorFetch(`${URL_}/functions/v1/pro-all-set`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` },
    body: JSON.stringify({ applicant_id: a.id }),
  }).catch(() => null);

  return jsonResponse({ ok: true, signed_at: signedAt.toISOString() });
});
