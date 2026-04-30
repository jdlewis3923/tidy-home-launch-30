// Tidy — Shared helper to notify Justin (Brevo email + PWA push + optional SMS).
// All channels are best-effort: a failure in one does not block the others.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';

const ADMIN_EMAIL = 'admin@jointidy.co';
const JUSTIN_PHONE = '+17868291141';
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
}) {
  const templateName = opts.templateName ?? opts.tags?.[0] ?? 'unknown';
  if (!BREVO_API_KEY) {
    console.warn('[brevo] BREVO_API_KEY missing');
    await logEmailSend({
      template_name: templateName, channel: 'email', recipient: opts.toEmail,
      triggered_by: opts.triggeredBy ?? null, status: 'failed',
      error_message: 'BREVO_API_KEY missing', payload: { subject: opts.subject },
    });
    return null;
  }
  let r: Response;
  try {
    r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Tidy', email: 'no-reply@jointidy.co' },
        to: [{ email: opts.toEmail, name: opts.toName ?? opts.toEmail }],
        subject: opts.subject,
        htmlContent: opts.htmlContent,
        ...(opts.tags && opts.tags.length ? { tags: opts.tags } : {}),
        ...(opts.attachments && opts.attachments.length ? { attachment: opts.attachments } : {}),
      }),
    });
  } catch (e) {
    await logEmailSend({
      template_name: templateName, channel: 'email', recipient: opts.toEmail,
      triggered_by: opts.triggeredBy ?? null, status: 'failed',
      error_message: (e as Error).message, payload: { subject: opts.subject },
    });
    return null;
  }
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    console.error('[brevo] send failed', r.status, errText);
    await logEmailSend({
      template_name: templateName, channel: 'email', recipient: opts.toEmail,
      triggered_by: opts.triggeredBy ?? null, status: 'failed',
      error_message: `HTTP ${r.status}: ${errText.slice(0, 500)}`,
      payload: { subject: opts.subject, tags: opts.tags ?? [] },
    });
    return null;
  }
  const json = await r.json().catch(() => ({})) as { messageId?: string };
  console.log('[brevo] sent', { to: opts.toEmail, subject: opts.subject, messageId: json.messageId });
  await logEmailSend({
    template_name: templateName, channel: 'email', recipient: opts.toEmail,
    triggered_by: opts.triggeredBy ?? null,
    brevo_message_id: json.messageId ?? null, status: 'sent',
    payload: { subject: opts.subject, tags: opts.tags ?? [], hasAttachments: !!opts.attachments?.length },
  });
  return json.messageId ?? null;
}

export async function sendPwaPushToJustin(title: string, body: string, url = '/admin/applicants') {
  // Look up admin user_ids and fan out push to each.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?role=eq.admin&select=user_id`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    const rows: Array<{ user_id: string }> = r.ok ? await r.json() : [];
    for (const row of rows) {
      await fetch(`${SUPABASE_URL}/functions/v1/send-pwa-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: row.user_id, title, body, url }),
      }).catch(()=>{});
    }
  } catch (e) {
    console.error('[push] fanout failed', e);
  }
}

export async function sendTwilioSmsToJustin(message: string, idemKey: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to_phone_e164: JUSTIN_PHONE,
        body: message,
        idempotency_key: idemKey,
      }),
    });
  } catch (e) {
    console.error('[sms] send failed', e);
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
