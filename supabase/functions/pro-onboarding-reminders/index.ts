import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — daily Pro onboarding reminder, 9:15 AM ET.
 *
 * For every applicant at the offer stage with something outstanding: ONE email
 * listing only what is still missing, with the same buttons as the welcome
 * email. Never one email per item.
 *
 * Cadence: a reminder at 2 days after the welcome email, another at 5 days,
 * then stop and raise an admin alert for Justin to call them instead.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { computeOnboardingState, reminderEmailHtml, SITE } from '../_shared/pro-onboarding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY_MS = 86_400_000;
/** Days after the welcome email at which a reminder goes out. Then we stop. */
const REMINDER_DAYS = [2, 5];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }

  const now = Date.now();
  const results: Array<Record<string, unknown>> = [];

  const { data: applicants, error } = await admin
    .from('applicants')
    .select(
      'id, first_name, last_name, email, current_stage, bg_check_status, checkr_invitation_id, checkr_report_status, coi_token, coi_token_expires_at, coi_pdf_url, coi_review_status, onboarding_email_sent_at, onboarding_reminder_count, onboarding_reminder_last_at',
    )
    .in('current_stage', ['offer', 'offer_sent'])
    .not('onboarding_email_sent_at', 'is', null);

  if (error) {
    console.error('[pro-onboarding-reminders] query failed', error.message);
    return jsonResponse({ ok: false, error: 'query_failed', message: error.message }, 500);
  }

  for (const applicant of applicants ?? []) {
    const { data: kit } = await admin
      .from('pro_kit')
      .select('token, token_expires_at, status')
      .eq('applicant_id', applicant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const state = computeOnboardingState(applicant as never, (kit ?? null) as never);
    const name = `${applicant.first_name ?? ''} ${applicant.last_name ?? ''}`.trim() || 'This Pro';

    if (!state.outstanding.length) {
      results.push({ applicant_id: applicant.id, action: 'complete' });
      continue;
    }

    const sentAt = new Date(applicant.onboarding_email_sent_at!).getTime();
    const daysSince = Math.floor((now - sentAt) / DAY_MS);
    const sentCount = applicant.onboarding_reminder_count ?? 0;

    // Never twice in one day, even if this job runs more than once.
    const lastAt = applicant.onboarding_reminder_last_at
      ? new Date(applicant.onboarding_reminder_last_at).getTime()
      : 0;
    if (lastAt && now - lastAt < DAY_MS - 3_600_000) {
      results.push({ applicant_id: applicant.id, action: 'skipped_recent' });
      continue;
    }

    if (sentCount >= REMINDER_DAYS.length) {
      // Out of reminders: a human call is the next step, not more email.
      await writeAlert(admin, {
        level: 'action',
        category: 'hiring',
        title: `${applicant.first_name ?? name} hasn't finished onboarding — call her/him`,
        body: `Two reminders have gone out and ${state.outstanding.length} item(s) are still missing: ${state.outstanding.join(', ')}. No more emails will be sent.`,
        action_label: 'Open the Pro record',
        action_url: `${SITE}/admin/applicants?applicant=${applicant.id}`,
        dedupe_key: `onboarding-stalled:${applicant.id}`,
      });
      results.push({ applicant_id: applicant.id, action: 'alerted' });
      continue;
    }

    const dueDay = REMINDER_DAYS[sentCount];
    if (daysSince < dueDay) {
      results.push({ applicant_id: applicant.id, action: 'not_due', days_since: daysSince });
      continue;
    }

    if (!applicant.email) {
      results.push({ applicant_id: applicant.id, action: 'no_email' });
      continue;
    }

    const { subject, html } = reminderEmailHtml(applicant.first_name ?? 'there', state, dueDay);
    let sent = false;
    let failure: string | null = null;
    try {
      const res = await sendBrevoEmail({
        to: [{ email: applicant.email, name: applicant.first_name ?? undefined }],
        marketing: false,
        subject,
        htmlContent: html,
        sender: { name: 'Tidy Home Concierge', email: 'hello@jointidy.co' },
        tags: ['pro-onboarding-reminder'],
        label: 'pro-onboarding-reminders',
      });
      sent = res.sent;
      if (!res.sent) failure = res.reason ?? 'send_failed';
    } catch (e) {
      failure = (e as Error).message;
    }

    const nowIso = new Date().toISOString();
    if (sent) {
      await admin
        .from('applicants')
        .update({
          onboarding_reminder_count: sentCount + 1,
          onboarding_reminder_last_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', applicant.id);
    } else {
      // Email is a second channel only — the alert is the record of truth.
      await writeAlert(admin, {
        level: 'warning',
        category: 'hiring',
        title: `Onboarding reminder email failed — ${name}`,
        body: `Still missing: ${state.outstanding.join(', ')}. Email error: ${failure}.`,
        action_label: 'Open the Pro record',
        action_url: `${SITE}/admin/applicants?applicant=${applicant.id}`,
        dedupe_key: `onboarding-reminder-failed:${applicant.id}:${nowIso.slice(0, 10)}`,
      });
    }

    await admin.from('onboarding_events').insert({
      applicant_id: applicant.id,
      event: sent ? 'onboarding_reminder_sent' : 'onboarding_reminder_failed',
      metadata: { day: dueDay, outstanding: state.outstanding, error: failure },
    });

    results.push({
      applicant_id: applicant.id,
      action: sent ? 'reminded' : 'email_failed',
      day: dueDay,
      outstanding: state.outstanding,
    });
  }

  return jsonResponse({ ok: true, checked: applicants?.length ?? 0, results });
});
