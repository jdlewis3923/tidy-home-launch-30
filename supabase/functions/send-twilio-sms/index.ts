// Tidy — Direct Twilio SMS sender (Phase 6, post-pivot; Phase 4 hardening)
//
// Edge functions call this with { to_phone_e164, body, idempotency_key } and we
// POST straight to Twilio's REST API using Basic auth.
//
// Guards:
//   - Send window: 08:00-18:00 America/New_York, Monday-Saturday only. A
//     message outside the window is QUEUED in public.sms_outbox and released by
//     the sms-outbox-release cron — never destroyed, never logged as success.
//   - Idempotency: dedupes against integration_logs.payload_hash within 24h.
//   - E.164 phone validation.
//   - Never send to the Tidy sending number itself (Twilio rejects To == From).
//   - StatusCallback is always set so delivery receipts reach
//     twilio-status-callback → public.sms_delivery_events.
//
// HTTP contract (Phase 4): failures return a NON-2xx status so every caller's
// error handling actually fires.
//   400 invalid JSON / validation failure / To == From
//   401 unauthorized
//   500 missing required env
//   502 Twilio rejected the message
//   202 queued for the next open window
//   200 sent, or skipped as a duplicate
//
// Auth: service-role bearer OR an admin user's access token.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { withLogging, logInvocation } from '../_shared/withLogging.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';
import { closedReason, isQuietHours, isSundayET, nextOpenWindow, queueSms } from '../_shared/sms-window.ts';

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
] as const;

const BodySchema = z.object({
  to_phone_e164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164 like +17865551234'),
  body: z.string().min(1).max(1600).optional(),
  content_sid: z.string().regex(/^HX[a-zA-Z0-9]+$/).optional(),
  content_variables: z.record(z.string()).optional(),
  idempotency_key: z.string().min(1).max(200),
  template_name: z.string().min(1).max(120).optional(),
  triggered_by: z.string().min(1).max(120).optional(),
  /** Set by sms-outbox-release when draining a parked message. */
  skip_window: z.boolean().optional(),
}).refine((v) => !!v.body || !!v.content_sid, {
  message: 'either body or content_sid required',
});


async function logSmsSend(
  supabaseUrl: string,
  serviceKey: string,
  args: {
    template_name: string;
    recipient: string;
    triggered_by?: string | null;
    twilio_sid?: string | null;
    status: 'queued' | 'sent' | 'failed';
    error_message?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/email_send_log`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        template_name: args.template_name,
        channel: 'sms',
        recipient: args.recipient,
        triggered_by: args.triggered_by ?? null,
        twilio_sid: args.twilio_sid ?? null,
        status: args.status,
        error_message: args.error_message ?? null,
        payload: args.payload ?? {},
      }),
    });
  } catch (e) {
    console.warn('[email_send_log:sms] insert failed', (e as Error).message);
  }
}

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

// Send-window helpers live in _shared/sms-window.ts so every SMS path
// (outbound alerts, AI replies, admin replies) uses the same clock.


async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isDuplicate(
  // deno-lint-ignore no-explicit-any
  admin: any,
  idempotencyHash: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('integration_logs')
    .select('id')
    .eq('source', 'twilio')
    .eq('event', 'sms.send')
    .eq('status', 'success')
    .eq('payload_hash', idempotencyHash)
    .gte('created_at', since)
    .limit(1);
  if (error) {
    console.error('[send-twilio-sms] dedupe lookup failed', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // ---- Health probe: no side effect, no auth, no secret values returned ----
  const url = new URL(req.url);
  const wantsHealth = req.method === 'GET' || url.searchParams.get('health') === '1';
  if (wantsHealth) {
    const { missing } = readEnv(REQUIRED_ENV);
    return jsonResponse({
      ok: missing.length === 0,
      function: 'send-twilio-sms',
      missing_env: missing,
      quiet_hours_now: isQuietHours(),
      sunday_now: isSundayET(),
    }, 200);
  }

  let finish: (status: 'success' | 'error' | 'warning', msg?: string | null) => Promise<void>;
  try {
    finish = await logInvocation('twilio', 'send_twilio_sms', { method: req.method });
  } catch {
    finish = async () => {};
  }

  try {
    if (req.method !== 'POST') {
      await finish('error', 'method_not_allowed');
      return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
    }

    const { values, missing } = readEnv(REQUIRED_ENV);
    if (missing.length > 0) {
      const err = missingEnvError(missing);
      console.error(`[send-twilio-sms] ${err} — no SMS can be sent`);
      await finish('error', err);
      return jsonResponse({ ok: false, sent: false, error: err, missing_env: missing }, 500);
    }
    const SUPABASE_URL = values.SUPABASE_URL;
    const SERVICE_KEY = values.SUPABASE_SERVICE_ROLE_KEY;
    const TWILIO_ACCOUNT_SID = values.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = values.TWILIO_AUTH_TOKEN;
    const TWILIO_FROM = values.TWILIO_FROM_NUMBER;

    // Cron jobs read the credential from Vault at call time, so accept that too.
  const authorized = (await isAuthorized(req, SUPABASE_URL, SERVICE_KEY)) || (await isCronAuthorized(req));
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
      return jsonResponse({ ok: false, sent: false, error: 'invalid_json_body' }, 400);
    }

    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      // Phase 4: a bad payload MUST be a non-2xx so the caller's catch fires.
      await finish('error', 'validation_failed');
      return jsonResponse(
        {
          ok: false,
          sent: false,
          error: 'validation_failed',
          details: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    }

    const {
      to_phone_e164, body, content_sid, content_variables,
      idempotency_key, template_name, triggered_by, skip_window,
    } = parsed.data;
    const tplName = template_name ?? content_sid ?? 'sms-adhoc';

    // Twilio always rejects To == From; catch it before spending a request.
    if (to_phone_e164 === TWILIO_FROM) {
      await finish('error', 'to_equals_from');
      return jsonResponse({
        ok: false,
        sent: false,
        error: 'to_equals_from',
        message: 'Destination is the Tidy sending number. Use a different phone number.',
      }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ---- Send window: queue instead of destroy ----
    const blocked = skip_window ? null : closedReason();
    if (blocked) {
      const releaseAfter = nextOpenWindow();
      const q = await queueSms(
        admin,
        { to_phone_e164, body, content_sid, content_variables, idempotency_key, template_name: tplName, triggered_by },
        blocked,
        releaseAfter,
      );
      if (!q.queued) {
        await finish('error', `queue_failed: ${q.error}`);
        return jsonResponse({ ok: false, sent: false, error: 'queue_failed', details: q.error }, 500);
      }
      await finish('warning', `queued for next window (${blocked})`);
      return jsonResponse({
        ok: true, sent: false, queued: true, reason: blocked, release_after: q.release_after,
      }, 202);
    }

    const idempotencyHash = await sha256(idempotency_key);

    if (await isDuplicate(admin, idempotencyHash)) {
      await finish('success', 'skipped: duplicate_idempotency_key');
      return jsonResponse({ ok: true, sent: false, reason: 'duplicate_idempotency_key' }, 200);
    }

    try {
      const result = await withLogging({
        source: 'twilio',
        event: 'sms.send',
        payload: idempotency_key,
        fn: async () => {
          const apiUrl =
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
          const basic = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

          const form = new URLSearchParams({ From: TWILIO_FROM, To: to_phone_e164 });
          if (content_sid) {
            form.set('ContentSid', content_sid);
            if (content_variables && Object.keys(content_variables).length > 0) {
              form.set('ContentVariables', JSON.stringify(content_variables));
            }
          } else if (body) {
            form.set('Body', body);
          }
          // Delivery receipts → twilio-status-callback → sms_delivery_events.
          form.set('StatusCallback', `${SUPABASE_URL}/functions/v1/twilio-status-callback`);

          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Basic ${basic}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: form.toString(),
          });

          const text = await res.text();
          let json: Record<string, unknown> = {};
          try { json = JSON.parse(text); } catch { /* keep raw */ }

          if (!res.ok) {
            throw new Error(
              `twilio ${res.status}: ${(json.message as string) ?? text.slice(0, 300)}`,
            );
          }

          return {
            ok: true as const,
            sent: true as const,
            message_sid: (json.sid as string) ?? null,
            status: (json.status as string) ?? null,
          };
        },
      });

      await logSmsSend(SUPABASE_URL, SERVICE_KEY, {
        template_name: tplName, recipient: to_phone_e164, triggered_by,
        twilio_sid: result.message_sid, status: 'sent',
        payload: { has_body: !!body, has_content_sid: !!content_sid },
      });
      await finish('success');
      return jsonResponse(result, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      console.error('[send-twilio-sms] failed', message);
      await finish('error', message);
      await logSmsSend(SUPABASE_URL, SERVICE_KEY, {
        template_name: tplName, recipient: to_phone_e164, triggered_by,
        status: 'failed', error_message: message,
      });
      // Phase 4: a vendor failure is a real failure — 502, not a silent 200.
      return jsonResponse({ ok: false, sent: false, error: message }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-twilio-sms] unhandled', message);
    await finish('error', `unhandled: ${message}`);
    return jsonResponse({ ok: false, sent: false, error: message }, 500);
  }

});
