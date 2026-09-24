/**
 * Send one built Pro email and record it in email_send_log (which also puts
 * it on the admin Workday feed) plus onboarding_events.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { sendBrevoEmail, type BrevoAttachment } from './brevo-send.ts';
import type { Built } from './pro-emails.ts';

export async function sendProEmail(admin: SupabaseClient, args: {
  applicantId: string | null;
  key: string;
  to: string;
  name?: string;
  built: Built;
  triggeredBy: string;
  attachment?: BrevoAttachment[];
}): Promise<{ sent: boolean; reason?: string }> {
  const res = await sendBrevoEmail({
    to: [{ email: args.to, name: args.name }],
    marketing: false,
    subject: args.built.subject,
    htmlContent: args.built.html,
    sender: { name: 'Tidy Home Concierge', email: 'hello@jointidy.co' },
    tags: ['pro', args.key],
    attachment: args.attachment,
    label: `pro-email:${args.key}`,
  });
  await admin.from('email_send_log').insert({
    template_name: `pro:${args.key}`,
    channel: 'email',
    recipient: args.to,
    triggered_by: args.triggeredBy,
    status: res.sent ? 'sent' : 'failed',
    error_message: res.sent ? null : (res.reason ?? 'send_failed'),
    payload: { applicant_id: args.applicantId, subject: args.built.subject },
  });
  if (args.applicantId) {
    await admin.from('onboarding_events').insert({
      applicant_id: args.applicantId,
      event: res.sent ? `email_sent:${args.key}` : `email_failed:${args.key}`,
      metadata: { recipient: args.to, subject: args.built.subject, by: args.triggeredBy },
    });
  }
  return { sent: res.sent, reason: res.reason };
}
