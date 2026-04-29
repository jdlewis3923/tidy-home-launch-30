// Tidy — Manual Background Check decision (admin-only)
//
// Justin clicks Mark CLEAR / CONSIDER / FAIL on /admin/applicants.
// This function runs the same downstream routing the real provider webhook
// would: stage transitions, Brevo notifications, PWA push, Twilio SMS on
// CONSIDER, and the branded rejection email on FAIL.
//
// Body: { applicant_id: uuid, decision: 'clear'|'consider'|'fail', notes?: string }

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import {
  sendBrevoEmail,
  sendPwaPushToJustin,
  sendTwilioSmsToJustin,
  brandedEmailHtml,
} from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  applicant_id: z.string().uuid(),
  decision: z.enum(['clear', 'consider', 'fail']),
  notes: z.string().max(2000).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // AuthN: caller must be a signed-in admin.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const { applicant_id, decision, notes } = parsed.data;

  const { data: applicant, error: fetchErr } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, service, current_stage')
    .eq('id', applicant_id).maybeSingle();
  if (fetchErr || !applicant) return jsonResponse({ error: 'not_found' }, 404);

  const fullName = `${applicant.first_name} ${applicant.last_name}`;
  const nowIso = new Date().toISOString();
  const baseUpdate: Record<string, any> = {
    bg_check_status: decision,
    bg_check_completed_at: nowIso,
    bg_check_provider: 'manual',
    bg_check_notes: notes ?? null,
  };

  let newStage: string;
  if (decision === 'clear') {
    newStage = 'interview_pending';
  } else if (decision === 'consider') {
    newStage = 'background_check_review';
  } else {
    newStage = 'rejected';
    baseUpdate.rejection_reason = 'background_check_failed';
    baseUpdate.rejected_at = nowIso;
  }

  const { error: updateErr } = await admin
    .from('applicants')
    .update({ ...baseUpdate, current_stage: newStage })
    .eq('id', applicant_id);
  if (updateErr) {
    console.error('[manual-bg-check] update failed', updateErr);
    return jsonResponse({ error: 'update_failed', details: updateErr.message }, 500);
  }

  // Fire downstream notifications (best-effort).
  queueMicrotask(async () => {
    if (decision === 'clear') {
      const html = brandedEmailHtml({
        heading: 'Background check passed ✅',
        bodyHtml: `<p><strong>${fullName}</strong> (${applicant.service}) was cleared. Ready for interview step.</p>`,
        ctaUrl: 'https://jointidy.co/admin/applicants',
        ctaLabel: 'Open pipeline',
      });
      await sendBrevoEmail({ toEmail: 'admin@jointidy.co', toName: 'Justin', subject: `BG check PASSED: ${fullName}`, htmlContent: html });
      await sendPwaPushToJustin('BG check passed', `${fullName} ready for interview`, '/admin/applicants');
    } else if (decision === 'consider') {
      const html = brandedEmailHtml({
        heading: 'Background check needs review ⚠️',
        bodyHtml: `<p><strong>${fullName}</strong> (${applicant.service}) was marked <strong>CONSIDER</strong>. Manual review required.</p>${notes ? `<p><em>Notes:</em> ${notes}</p>` : ''}`,
        ctaUrl: 'https://jointidy.co/admin/applicants',
        ctaLabel: 'Review now',
      });
      await sendBrevoEmail({ toEmail: 'admin@jointidy.co', toName: 'Justin', subject: `BG check REVIEW: ${fullName}`, htmlContent: html });
      await sendPwaPushToJustin('BG check needs review', `${fullName} — CONSIDER`, '/admin/applicants');
      await sendTwilioSmsToJustin(
        `Tidy: ${fullName} bg-check CONSIDER. Review at jointidy.co/admin/applicants`,
        `manual-consider-${applicant_id}`,
      );
    } else {
      // FAIL → branded rejection email to applicant + push to Justin.
      const applicantHtml = brandedEmailHtml({
        heading: 'Update on your Tidy application',
        bodyHtml: `
          <p>Hi ${applicant.first_name},</p>
          <p>Thank you for applying to join Tidy as a contractor. We've completed the background-check step that we run for every 1099 home-service contractor on our platform, and unfortunately we're not able to move forward with your application at this time.</p>
          <p>This policy applies to every applicant — it is not a judgment of you personally. You're welcome to reapply after 12 months.</p>
          <p>We appreciate your interest in Tidy and wish you the best.</p>
          <p>— Justin Lewis<br/>Founder, Tidy Home Concierge LLC</p>
        `,
      });
      await sendBrevoEmail({
        toEmail: applicant.email,
        toName: fullName,
        subject: 'Update on your Tidy application',
        htmlContent: applicantHtml,
      });
      await sendPwaPushToJustin('Applicant rejected', `${fullName} — bg check fail`, '/admin/applicants');
    }
  });

  return jsonResponse({ ok: true, applicant_id, current_stage: newStage, bg_check_status: decision });
});
