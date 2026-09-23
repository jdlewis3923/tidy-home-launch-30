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
// All traffic routes through the linked Brevo connection. Keeping a single
// transport prevents direct-IP allowlists and per-function secrets drifting.

import { logIntegrationEvent } from './integration-log.ts';
import { vendorFetch } from './http.ts';
import { brandHostedTemplate, ensureTidyEmailBranding, isTidyEmailCompliant } from './email-brand.ts';

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
  /** Kept for source compatibility. All sends use the gateway. */
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
  reason?: 'blacklisted' | 'no_api_key' | 'no_recipient' | 'branding_error' | 'http_error' | 'network_error';
  status?: number;
  messageId?: string | null;
  blockedRecipients?: string[];
}

const BREVO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/brevo/smtp/email';
const BREVO_CONTACT_URL = 'https://connector-gateway.lovable.dev/brevo/contacts';
const BREVO_TEMPLATE_URL = 'https://connector-gateway.lovable.dev/brevo/smtp/templates';
const DEFAULT_SENDER = { name: 'Tidy Home Concierge', email: 'hello@jointidy.co' };
const MAX_ATTEMPTS = 3;

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
  opts: { apiKey?: string; lovableApiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const apiKey = opts.apiKey ?? env('BREVO_API_KEY');
  const lovableApiKey = opts.lovableApiKey ?? env('LOVABLE_API_KEY');
  const doFetch = opts.fetchImpl ?? vendorFetch;
  if (!apiKey || !lovableApiKey) return false;
  try {
    const res = await doFetch(`${BREVO_CONTACT_URL}/${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        'X-Connection-Api-Key': apiKey,
        accept: 'application/json',
      },
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
  const doFetch = opts.fetchImpl ?? vendorFetch;
  const apiKey = opts.apiKey ?? env('BREVO_API_KEY');
  const lovableKey = opts.lovableApiKey ?? env('LOVABLE_API_KEY');
  const label = opts.label ?? 'brevo';

  let recipients = normalizeRecipients(opts.to);
  if (recipients.length === 0) return { sent: false, reason: 'no_recipient' };
  if (!apiKey) {
    console.warn(`[${label}] BREVO_API_KEY missing — not sending`);
    return { sent: false, reason: 'no_api_key' };
  }
  if (!lovableKey) {
    console.warn(`[${label}] LOVABLE_API_KEY missing — not sending`);
    return { sent: false, reason: 'no_api_key' };
  }

  const blocked: string[] = [];
  if (opts.marketing) {
    const keep: BrevoRecipient[] = [];
    for (const r of recipients) {
      if (await isBrevoBlacklisted(r.email, { apiKey, lovableApiKey: lovableKey, fetchImpl: doFetch })) {
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
  // Every code-generated email gets the complete Tidy shell. Template-driven
  // sends remain untouched because their design lives in the provider template.
  if (opts.htmlContent) body.htmlContent = ensureTidyEmailBranding(opts.htmlContent, opts.subject);
  body.sender = opts.sender ?? DEFAULT_SENDER;
  if (opts.tags?.length) body.tags = opts.tags;
  if (opts.attachment?.length) body.attachment = opts.attachment;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    accept: 'application/json',
    Authorization: `Bearer ${lovableKey}`,
    'X-Connection-Api-Key': apiKey,
  };

  // Hosted templates are checked immediately before every send. If someone
  // changes one in Brevo, Tidy repairs it first; if repair fails, the email is
  // blocked rather than sending dark, plain, or with the wrong logo.
  if (opts.templateId) {
    try {
      const templateResponse = await doFetch(`${BREVO_TEMPLATE_URL}/${Number(opts.templateId)}`, {
        method: 'GET', headers,
      });
      if (!templateResponse.ok) {
        console.error(`[${label}] template branding check failed`, templateResponse.status);
        return { sent: false, reason: 'branding_error', status: templateResponse.status, blockedRecipients: blocked };
      }
      const template = await templateResponse.json() as { subject?: string; name?: string; htmlContent?: string };
      const branded = brandHostedTemplate(
        template.htmlContent ?? '',
        template.subject ?? template.name ?? opts.subject ?? 'A Tidy update',
      );
      if (branded.changed) {
        const repairResponse = await doFetch(`${BREVO_TEMPLATE_URL}/${Number(opts.templateId)}`, {
          method: 'PUT', headers, body: JSON.stringify({ htmlContent: branded.html }),
        });
        if (!repairResponse.ok || !isTidyEmailCompliant(branded.html)) {
          console.error(`[${label}] template branding repair failed`, repairResponse.status);
          return { sent: false, reason: 'branding_error', status: repairResponse.status, blockedRecipients: blocked };
        }
      }
    } catch (e) {
      console.error(`[${label}] template branding guard error`, (e as Error).message);
      return { sent: false, reason: 'branding_error', blockedRecipients: blocked };
    }
  }

  let res: Response;
  const started = Date.now();
  try {
    let attempt = 0;
    while (true) {
      attempt += 1;
      res = await doFetch(BREVO_GATEWAY_URL, { method: 'POST', headers, body: JSON.stringify(body) });
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) break;
      const retryAfter = Number(res.headers.get('retry-after') ?? '0');
      const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : 250 * (2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  } catch (e) {
    console.error(`[${label}] brevo network error`, (e as Error).message);
    await logIntegrationEvent({
      source: 'brevo', event: `email.send:${label}`, status: 'error',
      latency_ms: Date.now() - started, error_message: (e as Error).message,
    });
    return { sent: false, reason: 'network_error', blockedRecipients: blocked };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[${label}] brevo send failed`, res.status, text.slice(0, 500));
    await logIntegrationEvent({
      source: 'brevo', event: `email.send:${label}`, status: 'error',
      latency_ms: Date.now() - started, error_message: `HTTP ${res.status}: ${text.slice(0, 300)}`,
    });
    return { sent: false, reason: 'http_error', status: res.status, blockedRecipients: blocked };
  }
  await logIntegrationEvent({
    source: 'brevo', event: `email.send:${label}`, status: 'success',
    latency_ms: Date.now() - started,
  });
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return {
    sent: true,
    status: res.status,
    messageId: json?.messageId ?? null,
    blockedRecipients: blocked,
  };
}

/**
 * Phase 4: a transport failure that nobody can see is worse than a crash.
 * sendBrevoEmail() returns { sent: false } — which every historical caller
 * ignored — so use this variant wherever a failure must reach a catch block,
 * suppress a dedupe latch, or fail the request.
 *
 * A recipient suppressed by the Brevo unsubscribe list is NOT an error: it
 * returns { sent: false, reason: 'blacklisted' } without throwing.
 */
export class BrevoSendError extends Error {
  readonly reason: SendBrevoEmailResult['reason'];
  readonly status?: number;
  constructor(result: SendBrevoEmailResult, label = 'brevo') {
    super(`[${label}] brevo send failed: ${result.reason}${result.status ? ` (HTTP ${result.status})` : ''}`);
    this.name = 'BrevoSendError';
    this.reason = result.reason;
    this.status = result.status;
  }
}

export async function sendBrevoEmailOrThrow(
  opts: SendBrevoEmailOptions,
): Promise<SendBrevoEmailResult> {
  const result = await sendBrevoEmail(opts);
  if (!result.sent && result.reason !== 'blacklisted') {
    throw new BrevoSendError(result, opts.label ?? 'brevo');
  }
  return result;
}

