import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — the single Pro onboarding email.
 *
 * POST { applicant_id, regenerate_tokens?: boolean }
 *
 * Sends Brevo template 64 (CONTRACTOR_WELCOME_T1), which carries all three
 * actions in one message: background check, insurance certificate, sizes + kit.
 * Called automatically when an applicant moves to the offer stage, and by the
 * "Resend onboarding email" button in the admin.
 *
 * The Checkr button is omitted when no invitation exists yet — the template then
 * says the invitation is on its way, so a Pro never taps a dead link.
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { EMAIL } from '../_shared/emailTemplates.ts';
import { ensureOnboardingTokens, loadOnboarding, SITE } from '../_shared/pro-onboarding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  applicant_id: z.string().uuid(),
  regenerate_tokens: z.boolean().optional(),
});

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
  const { applicant_id, regenerate_tokens } = parsed.data;

  try {
    await ensureOnboardingTokens(admin, applicant_id, regenerate_tokens ?? false);
  } catch (e) {
    console.error('[pro-onboarding-email] token mint failed', (e as Error).message);
    return jsonResponse({ error: 'token_mint_failed', message: (e as Error).message }, 500);
  }

  const { applicant, state } = await loadOnboarding(admin, applicant_id).catch(() => ({
    applicant: null,
    state: null,
  } as never));
  if (!applicant || !state) return jsonResponse({ error: 'applicant_not_found' }, 404);
  if (!applicant.email) return jsonResponse({ error: 'applicant_has_no_email' }, 400);
  if (!state.coi_url || !state.intake_url) {
    return jsonResponse({ error: 'links_unavailable' }, 500);
  }

  const params = {
    first_name: applicant.first_name ?? 'there',
    checkr_url: state.checkr_url ?? '',
    coi_url: state.coi_url,
    intake_url: state.intake_url,
    tier_progression_url: `${SITE}/pro/tier-progression`,
  };

  let sent = false;
  let failure: string | null = null;
  try {
    const res = await sendBrevoEmail({
      to: [{ email: applicant.email, name: applicant.first_name ?? undefined }],
      marketing: false,
      templateId: EMAIL.CONTRACTOR_WELCOME_T1,
      params,
      tags: ['pro-onboarding'],
      label: 'pro-onboarding-email',
    });
    sent = res.sent;
    if (!res.sent) failure = `${res.reason ?? 'send_failed'}${res.status ? ` (HTTP ${res.status})` : ''}`;
  } catch (e) {
    failure = (e as Error).message;
  }

  const nowIso = new Date().toISOString();
  if (sent) {
    await admin
      .from('applicants')
      .update({
        onboarding_email_sent_at: nowIso,
        onboarding_reminder_count: 0,
        onboarding_reminder_last_at: null,
        updated_at: nowIso,
      })
      .eq('id', applicant_id);
  }

  await admin.from('onboarding_events').insert({
    applicant_id,
    event: sent ? 'onboarding_email_sent' : 'onboarding_email_failed',
    metadata: {
      template_id: EMAIL.CONTRACTOR_WELCOME_T1,
      checkr_link_included: !!state.checkr_url,
      outstanding: state.outstanding,
      error: failure,
    },
  });

  if (!sent) return jsonResponse({ ok: false, error: 'email_failed', details: failure }, 502);

  return jsonResponse({
    ok: true,
    sent_to: applicant.email,
    checkr_link_included: !!state.checkr_url,
    coi_url: state.coi_url,
    intake_url: state.intake_url,
    outstanding: state.outstanding,
  });
});
