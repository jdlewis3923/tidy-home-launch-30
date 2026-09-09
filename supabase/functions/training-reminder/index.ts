import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Training Reminder (cron, daily)
//
// Fires a 24-hour-before reminder email to applicants whose training is
// scheduled between 22h and 26h from now. Idempotent via onboarding_events.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const now = Date.now();
  const windowStart = new Date(now + 22 * 3_600_000).toISOString();
  const windowEnd   = new Date(now + 26 * 3_600_000).toISOString();

  const { data: rows, error } = await admin
    .from('applicants')
    .select('id, first_name, email, training_scheduled_at')
    .gte('training_scheduled_at', windowStart)
    .lte('training_scheduled_at', windowEnd)
    .limit(200);
  if (error) return jsonResponse({ error: error.message }, 500);

  let sent = 0, skipped = 0, failed = 0;
  for (const a of rows ?? []) {
    const { data: dupe } = await admin
      .from('onboarding_events')
      .select('id')
      .eq('applicant_id', a.id)
      .eq('event', 'training_reminder_24h')
      .gte('created_at', new Date(now - 26 * 3_600_000).toISOString())
      .limit(1);
    if (dupe?.length) { skipped++; continue; }

    const when = new Date(a.training_scheduled_at!).toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short',
    });
    const html = brandedEmailHtml({
      heading: 'Reminder: Tidy live training tomorrow',
      bodyHtml: `<p>Hi ${a.first_name ?? 'there'},</p><p>Quick reminder — your Tidy live training is scheduled for <strong>${when} (Miami time)</strong>.</p><p>Bring your equipment if you haven't already submitted photos. If something has come up, reply to this email so we can reschedule.</p>`,
    });
    // Phase 4: the latch is written ONLY after a confirmed send. Writing it
    // unconditionally burned the single retry and the applicant heard nothing.
    try {
      await sendBrevoEmail({
        toEmail: a.email, toName: a.first_name ?? '',
        subject: 'Reminder: Tidy live training tomorrow',
        htmlContent: html, tags: ['applicant-training-reminder-24h'],
        templateName: 'applicant-training-reminder-24h', triggeredBy: 'training-reminder',
      });
    } catch (e) {
      failed++;
      const msg = (e as Error).message;
      console.error('[training-reminder] send failed — latch NOT written', a.id, msg);
      await admin.from('admin_alerts').insert({
        alert_type: 'training_reminder_send_failed',
        title: 'Training reminder email failed',
        body: `${a.email}: ${msg.slice(0, 200)} — will retry on the next run.`,
        context: { applicant_id: a.id },
      }).then(() => {}, () => {});
      continue;
    }

    await admin.from('onboarding_events').insert({
      applicant_id: a.id, event: 'training_reminder_24h',
      metadata: { scheduled_at: a.training_scheduled_at },
    });
    sent++;
  }

  return jsonResponse({ ok: failed === 0, sent, skipped, failed });
});
