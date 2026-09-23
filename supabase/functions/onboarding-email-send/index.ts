import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — send any one Pro onboarding email on demand (admin only).
 *
 * POST { applicant_id, email: key, mode: 'pro' | 'test' }
 *
 * One button per email in the onboarding sequence. 'pro' sends the real thing to
 * the Pro; 'test' sends the identical email to hello@jointidy.co and never
 * touches the applicant's record, so every message can be checked before a Pro
 * ever sees it.
 *
 * Nothing here decides anything: approving insurance still happens in
 * coi-decision. This only re-sends the message that step produces.
 *
 * Copy rules: 1099 independent contractors, never "employees"; Tidy provides the
 * kit, the Pro chooses.
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { EMAIL } from '../_shared/emailTemplates.ts';
import { vendorFetch } from '../_shared/http.ts';
import { loadOnboarding, reminderEmailHtml, OWNER_EMAIL, SITE } from '../_shared/pro-onboarding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Every onboarding email, in the order a Pro receives them. */
export const ONBOARDING_EMAIL_KEYS = [
  'welcome',
  'reminder',
  'kit_order',
  'insurance_approved',
  'insurance_rejected',
  'insurance_expiring',
] as const;

const Body = z.object({
  applicant_id: z.string().uuid(),
  email: z.enum(ONBOARDING_EMAIL_KEYS),
  mode: z.enum(['pro', 'test']).default('test'),
});

function templateIdFor(key: string): number | null {
  if (key === 'insurance_approved') return EMAIL.CONTRACTOR_T2_CONFIRMED;
  if (key === 'insurance_rejected') return EMAIL.CONTRACTOR_COI_REJECTED;
  if (key === 'insurance_expiring') return EMAIL.CONTRACTOR_COI_EXPIRING;
  return null;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id, email: key, mode } = parsed.data;
  const test = mode === 'test';

  let loaded;
  try {
    loaded = await loadOnboarding(admin, applicant_id);
  } catch {
    return jsonResponse({ error: 'applicant_not_found' }, 404);
  }
  const { applicant, kit, state } = loaded;
  const recipient = test ? OWNER_EMAIL : applicant.email;
  if (!recipient) return jsonResponse({ error: 'applicant_has_no_email' }, 400);

  const subjectPrefix = test ? '[TEST] ' : '';
  const firstName = applicant.first_name ?? 'there';

  const logEvent = async (sent: boolean, extra: Record<string, unknown> = {}) => {
    await admin.from('onboarding_events').insert({
      applicant_id,
      event: sent ? `email_sent:${key}` : `email_failed:${key}`,
      metadata: { mode, recipient, ...extra },
    });
  };

  // 1. Welcome email — the one message carrying all three actions.
  if (key === 'welcome') {
    if (!test) {
      const r = await vendorFetch(`${SUPABASE_URL}/functions/v1/pro-onboarding-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ applicant_id }),
      });
      const out = await r.json().catch(() => ({}));
      await logEvent(r.ok && out?.ok === true, { delegated: 'pro-onboarding-email' });
      return jsonResponse({ ok: r.ok && out?.ok === true, sent_to: recipient, details: out }, r.ok ? 200 : 502);
    }
    const res = await sendBrevoEmail({
      to: [{ email: recipient, name: 'Tidy (test)' }],
      marketing: false,
      templateId: EMAIL.CONTRACTOR_WELCOME_T1,
      params: {
        first_name: firstName,
        checkr_url: state.checkr_url ?? '',
        coi_url: state.coi_url ?? `${SITE}/coi/preview`,
        intake_url: state.intake_url ?? `${SITE}/intake/preview`,
        tier_progression_url: `${SITE}/pro/tier-progression`,
      },
      tags: ['pro-onboarding', 'test'],
      label: 'onboarding-email-send:welcome',
    });
    await logEvent(res.sent);
    return jsonResponse({ ok: res.sent, sent_to: recipient, reason: res.reason }, res.sent ? 200 : 502);
  }

  // 2. Reminder — only what is still outstanding, in one email.
  if (key === 'reminder') {
    const outstanding = state.outstanding.length ? state : { ...state, outstanding: ['insurance', 'intake'] as never };
    const { subject, html } = reminderEmailHtml(test ? 'there' : firstName, outstanding as never, 2);
    const res = await sendBrevoEmail({
      to: [{ email: recipient }],
      marketing: false,
      subject: `${subjectPrefix}${subject}`,
      htmlContent: html,
      label: 'onboarding-email-send:reminder',
    });
    await logEvent(res.sent, { outstanding: state.outstanding });
    return jsonResponse({ ok: res.sent, sent_to: recipient, reason: res.reason }, res.sent ? 200 : 502);
  }

  // 3. Kit order — the owner summary plus the Pro's kit confirmation.
  if (key === 'kit_order') {
    if (!kit?.token) return jsonResponse({ error: 'no_intake_yet' }, 400);
    const r = await vendorFetch(`${SUPABASE_URL}/functions/v1/intake-submitted`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify(test ? { token: kit.token, preview_to: OWNER_EMAIL } : { token: kit.token }),
    });
    const out = await r.json().catch(() => ({}));
    const ok = r.ok && out?.ok === true;
    await logEvent(ok, { delegated: 'intake-submitted', details: out });
    return jsonResponse({ ok, sent_to: recipient, details: out }, ok ? 200 : 502);
  }

  // 4–6. Insurance templates.
  const templateId = templateIdFor(key);
  if (!templateId) return jsonResponse({ error: 'unknown_email' }, 400);

  const res = await sendBrevoEmail({
    to: [{ email: recipient, name: test ? 'Tidy (test)' : `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim() || undefined }],
    marketing: false,
    templateId,
    params: {
      first_name: test ? 'there' : firstName,
      pay_uplift: '+10% on every visit',
      reason: test ? 'Sample reason — this is a test send.' : '',
      expires_at: '',
      coi_url: state.coi_url ?? `${SITE}/coi/preview`,
    },
    tags: ['pro-onboarding', key],
    label: `onboarding-email-send:${key}`,
  });
  await logEvent(res.sent, { template_id: templateId });
  return jsonResponse({ ok: res.sent, sent_to: recipient, reason: res.reason }, res.sent ? 200 : 502);
});
