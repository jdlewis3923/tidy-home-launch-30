import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — admin Send menu. Any single Pro/applicant email, on demand.
 *
 * POST { applicant_id, email, mode: 'preview' | 'send' | 'test', lang: 'both'|'en'|'es', reason? }
 *  preview → { subject, html, text, to } (nothing sent)
 *  send    → sends to the Pro, logs to email_send_log + Workday
 *  test    → identical email to hello@jointidy.co
 * Nothing here sends without an admin click.
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { EMAIL } from '../_shared/emailTemplates.ts';
import { ensureTidyEmailBranding, TIDY_OWNER_EMAIL } from '../_shared/email-brand.ts';
import { loadFive } from '../_shared/pro-five.ts';
import {
  allSetEmail, backgroundCheckEmail, badgePhotoEmail, contractEmail, declineEmail,
  insuranceRequestEmail, missingEmail, PHOTO_RETAKE_REASONS, type Built, type Lang, type RetakeReason,
} from '../_shared/pro-emails.ts';
import { sendProEmail } from '../_shared/pro-send.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export const PRO_EMAIL_KEYS = [
  'onboarding', 'background_check', 'insurance_request', 'contract', 'badge_photo',
  'photo_retake', 'all_set', 'missing', 'decline', 'tier2_offer',
] as const;

const Body = z.object({
  applicant_id: z.string().uuid(),
  email: z.enum(PRO_EMAIL_KEYS),
  mode: z.enum(['preview', 'send', 'test']).default('preview'),
  lang: z.enum(['both', 'en', 'es']).default('both'),
  reason: z.string().max(40).optional(),
});

async function hostedTemplate(id: number, params: Record<string, string>): Promise<Built> {
  const r = await vendorFetch(`https://connector-gateway.lovable.dev/brevo/smtp/templates/${id}`, {
    headers: {
      Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY') ?? ''}`,
      'X-Connection-Api-Key': Deno.env.get('BREVO_API_KEY') ?? '',
      Accept: 'application/json',
    },
  });
  if (!r.ok) throw new Error(`template ${id} ${r.status}`);
  const t = await r.json();
  const fill = (x: string) => String(x ?? '')
    .replace(/\{\{\s*params\.(\w+)[^}]*\}\}/g, (_m, k) => params[k] ?? '')
    .replace(/\{%[^%]*%\}/g, '');
  const html = ensureTidyEmailBranding(fill(t.htmlContent), fill(t.subject));
  const text = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
  return { subject: fill(t.subject), html, text };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const { applicant_id, email: key, mode, lang, reason } = parsed.data;

  let rec;
  try { rec = await loadFive(admin, applicant_id, { mintTokens: true }); }
  catch { return jsonResponse({ error: 'applicant_not_found' }, 404); }
  const a = rec.applicant;
  const first = a.first_name ?? 'there';
  const L = lang as Lang;
  let note: string | null = null;
  let built: Built;

  try {
    switch (key) {
      case 'onboarding':
      case 'tier2_offer': {
        const id = key === 'onboarding' ? EMAIL.CONTRACTOR_WELCOME_T1 : EMAIL.CONTRACTOR_T2_OFFER;
        built = await hostedTemplate(id, {
          first_name: first, checkr_url: rec.urls.background ?? '', coi_url: rec.urls.insurance ?? '',
          upload_coi_url: rec.urls.insurance ?? '', intake_url: rec.urls.intake ?? '',
          tier_progression_url: 'https://jointidy.co/pro/tier-progression', pay_uplift: '+10% on every visit',
        });
        if (L !== 'both') note = 'This email is a saved bilingual template; it is sent in English and Spanish together.';
        break;
      }
      case 'background_check': built = backgroundCheckEmail(first, rec.urls.background, L); break;
      case 'insurance_request': built = insuranceRequestEmail(first, rec.urls.insurance, L); break;
      case 'contract':
        if (!rec.urls.contract) return jsonResponse({ error: 'no_contract_link' }, 400);
        built = contractEmail(first, rec.urls.contract, L); break;
      case 'badge_photo':
      case 'photo_retake': {
        if (!rec.urls.photo) return jsonResponse({ error: 'no_photo_link', message: 'The photo link is created with the sizes form. Send the sizes form first.' }, 400);
        const r = key === 'photo_retake' ? ((reason && reason in PHOTO_RETAKE_REASONS ? reason : 'blurry') as RetakeReason) : null;
        built = badgePhotoEmail(first, rec.urls.photo, L, r); break;
      }
      case 'all_set':
        built = allSetEmail({ first, pro_number: a.pro_number, service: a.service, expected_delivery: rec.kit?.expected_delivery_date ?? null }, L);
        if (rec.missing.length) note = `Not all five are done yet (missing: ${rec.missing.join(', ')}). This sends only if you click.`;
        break;
      case 'missing':
        built = missingEmail(first, (rec.missing.length ? rec.missing : ['photo' as const]).map((k) => ({ key: k, url: rec.urls[k] })), L);
        if (!rec.missing.length) note = 'Nothing is missing — preview shows a sample.';
        break;
      case 'decline': built = declineEmail(first, L); break;
    }
  } catch (e) {
    return jsonResponse({ ok: false, error: 'build_failed', reason: (e as Error).message }, 502);
  }

  const to = mode === 'test' ? TIDY_OWNER_EMAIL : a.email;
  if (mode === 'preview') return jsonResponse({ ok: true, to: a.email, ...built!, note });
  if (!to) return jsonResponse({ error: 'applicant_has_no_email' }, 400);

  const b = mode === 'test' ? { ...built!, subject: `[TEST] ${built!.subject}` } : built!;
  const res = await sendProEmail(admin, {
    applicantId: mode === 'test' ? null : applicant_id, key, to, name: mode === 'test' ? 'Tidy (test)' : first,
    built: b, triggeredBy: auth.kind === 'admin' ? `admin:${auth.userId}` : 'service',
  });
  if (res.sent && mode === 'send') {
    const patch: Record<string, unknown> = {};
    if (key === 'contract') patch.contract_sent_at = new Date().toISOString();
    if (key === 'photo_retake') {
      await admin.from('pro_kit').update({ badge_photo_status: 'retake_requested', badge_photo_retake_reason: reason ?? 'blurry', badge_photo_reviewed_at: new Date().toISOString() }).eq('id', rec.kit!.id);
    }
    if (Object.keys(patch).length) await admin.from('applicants').update(patch).eq('id', applicant_id);
  }
  return jsonResponse({ ok: res.sent, sent_to: to, reason: res.reason, at: new Date().toISOString() }, res.sent ? 200 : 502);
});
