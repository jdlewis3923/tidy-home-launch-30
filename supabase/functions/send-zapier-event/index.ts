// Tidy — Zapier event emitter (Phase 6)
//
// All transactional email + SMS for Tidy is orchestrated through Zapier
// (which calls Brevo + Twilio). Edge functions never call Brevo/Twilio
// directly — they fire Zapier webhooks and let existing Zaps deliver.
//
// One secret per event: ZAP_<EVENT_NAME>_URL. If the secret is not set,
// the request is logged as skipped (no error) so partial rollouts work.
//
// Auth: this function is service-role only. It is invoked by other edge
// functions (stripe-webhook, jobber-webhook, account-provisioning) and
// by the admin /admin/test-zapier route. JWT verification is handled at
// the gateway by config.toml — we additionally require the Authorization
// header to match the service role key OR a valid admin user JWT.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Phase 6 active events. visit_* and password_reset are reserved (will be
// wired in Phase 3 / future auth hook).
const EventNameSchema = z.enum([
  'welcome_signup',
  'subscription_confirmed',
  'visit_scheduled',
  'visit_on_the_way',
  'visit_complete',
  'visit_canceled',
  'visit_rescheduled',
  'payment_failed',
  'password_reset',
]);

const BodySchema = z.object({
  event_name: EventNameSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  lang: z.enum(['en', 'es']).default('en'),
  user_id: z.string().uuid().optional(),
});

function envUrlFor(eventName: string): string | undefined {
  return Deno.env.get(`ZAP_${eventName.toUpperCase()}_URL`);
}

// ---------------------------------------------------------------------------
// SMS templating + direct Twilio dispatch (Phase 6 architectural pivot)
// ---------------------------------------------------------------------------
//
// Edge functions used to rely on Zapier to drive Twilio. The Zapier UI is
// unworkable for SMS in our automation, so we now POST directly to Twilio via
// the `send-twilio-sms` edge function. We KEEP the Zapier dispatch firing in
// parallel because Brevo email Zaps still subscribe to the same webhooks.

type SmsEventName =
  | 'welcome_signup'
  | 'subscription_confirmed'
  | 'payment_failed'
  | 'visit_complete'
  | 'visit_canceled'
  | 'visit_rescheduled';

const SMS_TEMPLATES: Record<SmsEventName, (p: Record<string, unknown>) => string> = {
  welcome_signup: (p) =>
    `Hi ${str(p.first_name, 'there')}, welcome to Tidy! Your account is ready: https://jointidy.co/dashboard. Reply STOP to opt out.`,
  subscription_confirmed: (p) =>
    `Tidy: Subscription confirmed (${str(p.services_display, 'your services')}, ${str(p.frequency_display, 'your plan')}). First visit details emailed. Manage: ${str(p.dashboard_url, 'https://jointidy.co/dashboard')}`,
  payment_failed: (p) =>
    `Tidy: Card declined for ${str(p.amount_due_display, 'your latest invoice')}. Update payment to keep service: ${str(p.update_payment_url, 'https://jointidy.co/billing')}`,
  visit_complete: (p) =>
    `Tidy: ${str(p.service_display, 'Your service')} done. Thanks for trusting us, ${str(p.first_name, 'friend')}. Mind leaving a quick review? ${str(p.review_url, 'https://jointidy.co/refer')}`,
  visit_canceled: (p) =>
    `Tidy: Your ${str(p.service_display, 'visit')} on ${str(p.visit_date_display, 'your scheduled date')} was canceled (${str(p.cancel_reason, 'no reason given')}). Reschedule: ${str(p.reschedule_url, 'https://jointidy.co/dashboard')}`,
  visit_rescheduled: (p) =>
    `Tidy: Your ${str(p.service_display, 'visit')} moved from ${str(p.old_visit_date_display, 'previous date')} to ${str(p.new_visit_date_display, 'new date')} (${str(p.new_time_window, 'TBD')}). Manage: ${str(p.reschedule_url, 'https://jointidy.co/dashboard')}`,
};

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v : fallback;
}

function isSmsEvent(name: string): name is SmsEventName {
  return name in SMS_TEMPLATES;
}

/**
 * Fire a direct Twilio SMS via send-twilio-sms. Best-effort — never throws,
 * never blocks the Zapier dispatch.
 */
async function dispatchTwilioSms(
  eventName: SmsEventName,
  payload: Record<string, unknown>,
  userId: string | undefined,
): Promise<{ attempted: boolean; ok: boolean; reason?: string; sid?: string | null }> {
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  if (!phone) {
    return { attempted: false, ok: false, reason: 'no_phone' };
  }

  // Normalize to E.164 (assume US if 10 digits and no +).
  let to = phone;
  if (!to.startsWith('+')) {
    const digits = to.replace(/\D/g, '');
    if (digits.length === 10) to = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith('1')) to = `+${digits}`;
    else return { attempted: false, ok: false, reason: 'phone_not_e164' };
  }

  const body = SMS_TEMPLATES[eventName](payload);
  const idempotency_key = `${eventName}:${userId ?? 'anon'}:${
    (payload.idempotency_suffix as string | undefined) ??
    (payload.visit_id as string | undefined) ??
    (payload.invoice_id as string | undefined) ??
    new Date().toISOString().slice(0, 10)
  }`;

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to_phone_e164: to, body, idempotency_key }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { attempted: true, ok: false, reason: `http_${res.status}` };
    }
    return {
      attempted: true,
      ok: !!json.ok,
      reason: typeof json.reason === 'string' ? json.reason : undefined,
      sid: (json.message_sid as string | undefined) ?? null,
    };
  } catch (err) {
    console.error('[send-zapier-event] twilio dispatch failed', err);
    return { attempted: true, ok: false, reason: 'fetch_error' };
  }
}

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);

  // Service-role key (used by other edge functions + DB trigger via pg_net).
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

  // Admin user JWT (used by /admin/test-zapier).
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error } = await supabase.auth.getClaims(token);
    if (error || !claims?.claims?.sub) return false;
    const userId = claims.claims.sub as string;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!roleRow;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  const ok = await isAuthorized(req);
  if (!ok) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON body' }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  const { event_name, payload, lang, user_id } = parsed.data;

  try {
    const result = await withLogging({
      source: 'zapier',
      event: event_name,
      payload: { user_id, lang, payload },
      fn: async () => {
        const url = envUrlFor(event_name);
        if (!url) {
          console.log(`[send-zapier-event] no URL configured for ${event_name} — skipping`);
          return { ok: true as const, skipped: 'no_url_configured' as const };
        }

        const body = { event_name, lang, user_id, ...payload };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        // Drain body to avoid leaks.
        const text = await res.text().catch(() => '');

        if (!res.ok) {
          throw new Error(`zapier ${event_name} returned ${res.status}: ${text.slice(0, 200)}`);
        }

        return { ok: true as const, status: res.status, dispatched: true as const };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-zapier-event] failed', event_name, message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
