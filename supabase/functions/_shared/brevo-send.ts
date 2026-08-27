// Tidy — single Brevo send helper with CAN-SPAM opt-out enforcement.
//
// Brevo's transactional endpoint (/v3/smtp/email) does NOT honor the marketing
// unsubscribe (blacklist) state. So for any send classified as marketing we look
// the contact up first and refuse to send when emailBlacklisted === true.
//
// Rules:
//  - marketing: true  -> GET /v3/contacts/{email}; blacklisted => do not send.
//                        404 (unknown contact) => send. Any other error => send
//                        (a Brevo outage must not silently kill mail).
//  - marketing: false -> no lookup, send directly (relationship / ops mail).
//
// Transport: 'direct' hits api.brevo.com with the api-key header. 'gateway'
// routes through the Lovable connector gateway. The blacklist lookup always
// uses api.brevo.com with BREVO_API_KEY, as that is the only endpoint that
// exposes contact state.

export type BrevoRecipient = { email: string; name?: string };
export type BrevoAttachment = { url?: string; content?: string; name: string };

export interface SendBrevoEmailOptions {
  to: string | BrevoRecipient | Array<string | BrevoRecipient>;
  /** REQUIRED. true = marketing/lifecycle mail (opt-out enforced). */
  marketing: boolean;
  templateId?: number;
  params?: Record<string, unknown>;
  subject?: string;
  htmlContent?: string;
  sender?: { name: string; email: string };
  tags?: string[];
  attachment?: BrevoAttachment[];
  /** 'direct' (default) or 'gateway' */
  transport?: 'direct' | 'gateway';
  /** Overrides, mainly for tests. */
  apiKey?: string;
  lovableApiKey?: string;
  fetchImpl?: typeof fetch;
  /** Free-form label used in logs only. */
  label?: string;
}

export interface SendBrevoEmailResult {
  sent: boolean;
  reason?: 'blacklisted' | 'no_api_key' | 'no_recipient' | 'http_error' | 'network_error';
  status?: number;
  messageId?: string | null;
  blockedRecipients?: string[];
}

const BREVO_DIRECT_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo/smtp/email';
const BREVO_CONTACT_URL = 'https://api.brevo.com/v3/contacts';

function env(name: string): string | undefined {
  // Deno at runtime; undefined under vitest/node.
  const d = (globalThis as { Deno?: { env?: { get(k: string): string | undefined } } }).Deno;
  try {
    return d?.env?.get(name);
  } catch {
    return undefined;
  }
}

function normalizeRecipients(
  to: SendBrevoEmailOptions['to'],
): BrevoRecipient[] {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((r) => (typeof r === 'string' ? { email: r } : r))
    .filter((r) => !!r?.email);
}

/**
 * Returns true when Brevo says this contact is blacklisted (unsubscribed).
 * Fails open: unknown contact or any lookup error returns false.
 */
export async function isBrevoBlacklisted(
  email: string,
  opts: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const apiKey = opts.apiKey ?? env('BREVO_API_KEY');
  const doFetch = opts.fetchImpl ?? fetch;
  if (!apiKey) return false;
  try {
    const res = await doFetch(`${BREVO_CONTACT_URL}/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (res.status === 404) return false;
    if (!res.ok) {
      console.warn('[brevo] blacklist lookup failed, sending anyway', res.status);
      return false;
    }
    const json = (await res.json().catch(() => ({}))) as { emailBlacklisted?: boolean };
    return json?.emailBlacklisted === true;
  } catch (e) {
    console.warn('[brevo] blacklist lookup error, sending anyway', (e as Error).message);
    return false;
  }
}

export async function sendBrevoEmail(
  opts: SendBrevoEmailOptions,
): Promise<SendBrevoEmailResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const apiKey = opts.apiKey ?? env('BREVO_API_KEY');
  const lovableKey = opts.lovableApiKey ?? env('LOVABLE_API_KEY');
  const transport = opts.transport ?? 'direct';
  const label = opts.label ?? 'brevo';

  let recipients = normalizeRecipients(opts.to);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipient' };
  if (!apiKey) {
    console.warn(`[${label}] BREVO_API_KEY missing — not sending`);
    return { sent: false, reason: 'no_api_key' };
  }
  if (transport === 'gateway' && !lovableKey) {
    console.warn(`[${label}] LOVABLE_API_KEY missing — not sending`);
    return { sent: false, reason: 'no_api_key' };
  }

  const blocked: string[] = [];
  if (opts.marketing) {
    const keep: BrevoRecipient[] = [];
    for (const r of recipients) {
      if (await isBrevoBlacklisted(r.email, { apiKey, fetchImpl: doFetch })) {
        blocked.push(r.email);
      } else {
        keep.push(r);
      }
    }
    if (keep.length === 0) {
      console.info(`[${label}] suppressed marketing send — contact blacklisted in Brevo`, {
        blocked: blocked.length,
      });
      return { sent: false, reason: 'blacklisted', blockedRecipients: blocked };
    }
    recipients = keep;
  }

  const body: Record<string, unknown> = { to: recipients };
  if (opts.templateId) body.templateId = Number(opts.templateId);
  if (opts.params) body.params = opts.params;
  if (opts.subject) body.subject = opts.subject;
  if (opts.htmlContent) body.htmlContent = opts.htmlContent;
  if (opts.sender) body.sender = opts.sender;
  if (opts.tags?.length) body.tags = opts.tags;
  if (opts.attachment?.length) body.attachment = opts.attachment;

  const url = transport === 'gateway' ? BREVO_GATEWAY_URL : BREVO_DIRECT_URL;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    accept: 'application/json',
  };
  if (transport === 'gateway') {
    headers.Authorization = `Bearer ${lovableKey}`;
    headers['X-Connection-Api-Key'] = apiKey;
  } else {
    headers['api-key'] = apiKey;
  }

  let res: Response;
  try {
    res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    console.error(`[${label}] brevo network error`, (e as Error).message);
    return { sent: false, reason: 'network_error', blockedRecipients: blocked };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[${label}] brevo send failed`, res.status, text.slice(0, 500));
    return { sent: false, reason: 'http_error', status: res.status, blockedRecipients: blocked };
  }
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return {
    sent: true,
    status: res.status,
    messageId: json?.messageId ?? null,
    blockedRecipients: blocked,
  };
}
