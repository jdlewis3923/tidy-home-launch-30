// Tidy — Shared helper to notify Justin (Brevo email + PWA push + optional SMS).
// All channels are best-effort: a failure in one does not block the others.

import { BrevoSendError, sendBrevoEmail as sendViaBrevo } from './brevo-send.ts';

export { BrevoSendError };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';

const ADMIN_EMAIL = 'admin@jointidy.co';
// One source of truth: the JUSTIN_ALERT_PHONE secret every alerting function
// already reads. The literal stays only as a fallback if the secret is unset.
const JUSTIN_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '+17868291141';
const TIDY_LOGO = 'https://miami-home-simplify.lovable.app/icon-192.png';

export type BrevoAttachment = { url?: string; content?: string; name: string };

/** Best-effort write to public.email_send_log for /admin/email-health. */
async function logEmailSend(row: {
  template_name: string;
  channel: 'email' | 'sms';
  recipient: string;
  triggered_by?: string | null;
  brevo_message_id?: string | null;
  twilio_sid?: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  error_message?: string | null;
  payload?: Record<string, unknown>;
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_send_log`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        template_name: row.template_name,
        channel: row.channel,
        recipient: row.recipient,
        triggered_by: row.triggered_by ?? null,
        brevo_message_id: row.brevo_message_id ?? null,
        twilio_sid: row.twilio_sid ?? null,
        status: row.status,
        error_message: row.error_message ?? null,
        payload: row.payload ?? {},
      }),
    });
  } catch (e) {
    console.warn('[email_send_log] insert failed', (e as Error).message);
  }
}

export { logEmailSend };

export async function sendBrevoEmail(opts: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  tags?: string[];
  attachments?: BrevoAttachment[];
  templateName?: string;   // explicit template name for email_send_log
  triggeredBy?: string;    // edge fn / cron name for email_send_log
  /** true for lifecycle/marketing mail — enforces the Brevo unsubscribe list. */
  marketing?: boolean;
}) {
  const templateName = opts.templateName ?? opts.tags?.[0] ?? 'unknown';
  if (!BREVO_API_KEY) {
    console.warn('[brevo] BREVO_API_KEY missing');
    await logEmailSend({
      template_name: templateName, channel: 'email', recipient: opts.toEmail,
      triggered_by: opts.triggeredBy ?? null, status: 'failed',
      error_message: 'BREVO_API_KEY missing', payload: { subject: opts.subject },
    });
    // Phase 4: no silent null. A caller must be able to see this.
    throw new BrevoSendError({ sent: false, reason: 'no_api_key' }, 'notifyJustin');
  }
  // All sends go through the shared helper so marketing mail honors the Brevo
  // unsubscribe (blacklist) list. Defaults to relationship mail (marketing: false).
  const result = await sendViaBrevo({
    to: [{ email: opts.toEmail, name: opts.toName ?? opts.toEmail }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
    sender: { name: 'Tidy', email: 'no-reply@jointidy.co' },
    tags: opts.tags,
    attachment: opts.attachments,
    marketing: opts.marketing ?? false,
    label: 'notifyJustin',
  });

  if (!result.sent) {
    if (result.reason === 'blacklisted') {
      await logEmailSend({
        template_name: templateName, channel: 'email', recipient: opts.toEmail,
        triggered_by: opts.triggeredBy ?? null, status: 'failed',
        error_message: 'suppressed: recipient unsubscribed (Brevo emailBlacklisted)',
        payload: { subject: opts.subject, tags: opts.tags ?? [] },
      });
      return null;
    }
    await logEmailSend({
      template_name: templateName, channel: 'email', recipient: opts.toEmail,
      triggered_by: opts.triggeredBy ?? null, status: 'failed',
      error_message: `${result.reason ?? 'send failed'}${result.status ? ` (HTTP ${result.status})` : ''}`,
      payload: { subject: opts.subject, tags: opts.tags ?? [] },
    });
    // Phase 4: a Brevo 500 used to read as a successful send. It now throws so
    // every try/catch wrapped around this call becomes live code.
    throw new BrevoSendError(result, 'notifyJustin');
  }

  console.log('[brevo] sent', { to: opts.toEmail, subject: opts.subject, messageId: result.messageId });
  await logEmailSend({
    template_name: templateName, channel: 'email', recipient: opts.toEmail,
    triggered_by: opts.triggeredBy ?? null,
    brevo_message_id: result.messageId ?? null, status: 'sent',
    payload: { subject: opts.subject, tags: opts.tags ?? [], hasAttachments: !!opts.attachments?.length },
  });
  return result.messageId ?? null;
}

export async function sendPwaPushToJustin(title: string, body: string, url = '/admin/applicants') {
  // Look up admin user_ids and fan out push to each.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?role=eq.admin&select=user_id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const rows: Array<{ user_id: string }> = r.ok ? await r.json() : [];
    for (const row of rows) {
      // Phase 4: a push that returns 500 (or sent:0) must not read as success.
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-pwa-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, title, body, url }),
      }).catch((e) => { console.error('[push] fetch failed', (e as Error).message); return null; });
      if (!res) continue;
      if (!res.ok) {
        console.error('[push] send-pwa-push failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
        continue;
      }
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      if ((j as { sent?: number }).sent === 0) {
        console.warn('[push] no device received the alert', j);
      }
    }
  } catch (e) {
    console.error('[push] fanout failed', e);
  }
}

export async function sendTwilioSmsToJustin(message: string, idemKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_phone_e164: JUSTIN_PHONE,
        body: message,
        idempotency_key: idemKey,
        triggered_by: 'notifyJustin',
      }),
    });
    if (!res.ok && res.status !== 202) {
      console.error('[sms] send failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[sms] send failed', e);
    return false;
  }
}

export function brandedEmailHtml(opts: {
  heading: string;
  bodyHtml: string;
  ctaUrl?: string;
  ctaLabel?: string;
}): string {
  const cta = opts.ctaUrl
    ? `<a href="${opts.ctaUrl}" style="display:inline-block;background:#f5c518;color:#0f172a;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none;font-family:Arial,sans-serif">${opts.ctaLabel ?? 'View'}</a>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:0">
    <div style="background:#0f172a;padding:18px 24px">
      <img src="${TIDY_LOGO}" alt="Tidy" width="44" height="44" style="vertical-align:middle;border-radius:8px"/>
      <span style="color:#ffffff;font-weight:700;font-size:18px;margin-left:10px;vertical-align:middle">Tidy</span>
    </div>
    <div style="height:4px;background:#f5c518"></div>
    <div style="padding:28px 24px">
      <h1 style="margin:0 0 14px;font-size:22px;color:#0f172a">${opts.heading}</h1>
      <div style="font-size:15px;line-height:1.55;color:#475569">${opts.bodyHtml}</div>
      ${cta ? `<div style="margin-top:24px">${cta}</div>` : ''}
    </div>
    <div style="padding:16px 24px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0">
      Tidy Home Concierge LLC · Miami, FL
    </div>
  </div></body></html>`;
}
