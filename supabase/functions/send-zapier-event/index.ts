// Tidy — Zapier event emitter (Phase 6)
//
// Zapier feeds the Brevo email Zaps; SMS is dispatched directly through
// send-twilio-sms. One secret per event: ZAP_<EVENT_NAME>_URL. A missing
// URL is a graceful skip, not an error, so partial rollouts work.
//
// Hardening rules (prompt 4, part 1):
//   - Every env var is read INSIDE the handler, never at module scope.
//   - The whole handler body is wrapped in try/catch. A throw is logged to
//     integration_logs and returned as HTTP 200 { ok: false, error } so a
//     failing side effect never 500s the caller.
//   - A missing required var returns a named "MISSING_ENV: X" error.
//   - GET (or ?health=1) returns { ok, missing_env: [...] } without firing
//     the side effect, so the admin Health panel can probe safely.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging, logInvocation } from '../_shared/withLogging.ts';
import { readEnv, readOptionalEnv, missingEnvError } from '../_shared/handlerEnv.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

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

/** Best-effort direct Twilio dispatch. Never throws. */
async function dispatchTwilioSms(
  supabaseUrl: string,
  serviceKey: string,
  eventName: SmsEventName,
  payload: Record<string, unknown>,
  userId: string | undefined,
): Promise<{ attempted: boolean; ok: boolean; reason?: string; sid?: string | null }> {
  const phone = typeof payload.phone === 'string' ? payload.phone.trim() : '';
  if (!phone) return { attempted: false, ok: false, reason: 'no_phone' };

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
    const res = await fetch(`${supabaseUrl}/functions/v1/send-twilio-sms`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to_phone_e164: to, body, idempotency_key }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { attempted: true, ok: false, reason: `http_${res.status}` };
    return {
      attempted: true,
      ok: !!json.ok,
      reason: typeof json.reason === 'string'
        ? json.reason
        : typeof json.error === 'string'
          ? json.error
          : undefined,
      sid: (json.message_sid as string | undefined) ?? null,
    };
  } catch (err) {
    console.error('[send-zapier-event] twilio dispatch failed', err);
    return { attempted: true, ok: false, reason: 'fetch_error' };
  }
}

/**
 * Service-role bearer OR an admin user's access token.
 *
 * The token is validated with a service-role client so this path does not
 * depend on SUPABASE_ANON_KEY being present in the function environment.
 */
async function isAuthorized(
  req: Request,
  supabaseUrl: string,
  serviceKey: string,
): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  if (!token) return false;

  if (token === serviceKey) return true;

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;
    if (error || !userId) {
      console.error('[auth] getUser failed', error?.message ?? 'no user');
      return false;
    }
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!roleRow;
  } catch (err) {
    console.error('[auth] check threw', err instanceof Error ? err.message : err);
    return false;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // ---- Health probe: no side effect, no auth, no secrets leaked ----
  const url = new URL(req.url);
  const wantsHealth = req.method === 'GET' || url.searchParams.get('health') === '1';
  if (wantsHealth) {
    const { missing } = readEnv(REQUIRED_ENV);
    const configuredEvents = EventNameSchema.options.filter(
      (e) => !!readOptionalEnv(`ZAP_${e.toUpperCase()}_URL`),
    );
    return jsonResponse({
      ok: missing.length === 0,
      function: 'send-zapier-event',
      missing_env: missing,
      configured_events: configuredEvents,
      unconfigured_events: EventNameSchema.options.filter((e) => !configuredEvents.includes(e)),
    }, 200);
  }

  // Entry log BEFORE any work, so a crash still leaves a row in Health.
  let finish: (status: 'success' | 'error' | 'warning', msg?: string | null) => Promise<void>;
  try {
    finish = await logInvocation('zapier', 'send_zapier_event', { method: req.method });
  } catch {
    finish = async () => {};
  }

  try {
    if (req.method !== 'POST') {
      await finish('error', 'method_not_allowed');
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 200);
    }

    const { values, missing } = readEnv(REQUIRED_ENV);
    if (missing.length > 0) {
      const err = missingEnvError(missing);
      console.error(`[send-zapier-event] ${err}`);
      await finish('error', err);
      return jsonResponse({ ok: false, error: err, missing_env: missing }, 200);
    }
    const SUPABASE_URL = values.SUPABASE_URL;
    const SERVICE_KEY = values.SUPABASE_SERVICE_ROLE_KEY;

    const authorized = await isAuthorized(req, SUPABASE_URL, SERVICE_KEY);
    if (!authorized) {
      await finish('error', 'unauthorized');
      return jsonResponse(
        {
          ok: false,
          error: 'unauthorized',
          hint: 'send a service-role bearer token or an admin user access token',
        },
        401,
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      await finish('error', 'invalid_json_body');
      return jsonResponse({ ok: false, error: 'invalid_json_body' }, 200);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      await finish('error', 'validation_failed');
      return jsonResponse(
        { ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
        200,
      );
    }

    const { event_name, payload, lang, user_id } = parsed.data;

    const zapierPromise = withLogging({
      source: 'zapier',
      event: event_name,
      payload: { user_id, lang, payload },
      fn: async () => {
        const zapUrl = readOptionalEnv(`ZAP_${event_name.toUpperCase()}_URL`);
        if (!zapUrl) {
          console.log(`[send-zapier-event] no URL configured for ${event_name} — skipping`);
          return { ok: true as const, skipped: 'no_url_configured' as const };
        }

        const res = await fetch(zapUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_name, lang, user_id, ...payload }),
        });
        const text = await res.text().catch(() => '');
        if (!res.ok) {
          throw new Error(`zapier ${event_name} returned ${res.status}: ${text.slice(0, 200)}`);
        }
        return { ok: true as const, status: res.status, dispatched: true as const };
      },
    }).catch((err) => {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.error('[send-zapier-event] zapier failed', event_name, message);
      return { ok: false as const, error: message };
    });

    const twilioPromise = isSmsEvent(event_name)
      ? dispatchTwilioSms(SUPABASE_URL, SERVICE_KEY, event_name, payload, user_id)
      : Promise.resolve({ attempted: false, ok: false, reason: 'event_not_sms' as const });

    const [zapier, twilio] = await Promise.all([zapierPromise, twilioPromise]);

    const overallOk = (zapier as { ok?: boolean }).ok !== false;
    await finish(
      overallOk ? 'success' : 'error',
      overallOk ? null : (zapier as { error?: string }).error ?? 'zapier dispatch failed',
    );
    // Always 200: a failed side effect must not 500 the caller. Read `ok`.
    return jsonResponse({ ok: overallOk, event_name, zapier, twilio }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-zapier-event] unhandled', message);
    await finish('error', `unhandled: ${message}`);
    return jsonResponse({ ok: false, error: message }, 200);
  }
});
