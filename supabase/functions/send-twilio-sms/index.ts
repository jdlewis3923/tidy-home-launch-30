// Tidy — Direct Twilio SMS sender (Phase 6, post-pivot)
//
// Replaces the Zapier→Twilio path for outbound SMS. Edge functions call this
// directly with { to_phone_e164, body, idempotency_key } and we POST straight
// to Twilio's REST API using Basic auth.
//
// Guards:
//   - Quiet hours: only sends between 9:00 and 21:00 America/New_York.
//   - Idempotency: dedupes against integration_logs.payload_hash within 24h.
//   - E.164 phone validation.
//
// Auth: service role (called by other edge functions) OR admin user JWT
// (for /admin/test-zapier-style self-tests). Same pattern as send-zapier-event.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_FROM = '+17868291141';

const BodySchema = z.object({
  to_phone_e164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'must be E.164 like +17865551234'),
  body: z.string().min(1).max(1600),
  idempotency_key: z.string().min(1).max(200),
});

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);

  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

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

/** Returns the current hour (0-23) in America/New_York. */
function easternHour(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour');
  // Intl can return "24" at midnight in some runtimes — normalize.
  const h = parseInt(hourPart?.value ?? '0', 10);
  return Number.isFinite(h) ? h % 24 : 0;
}

function isQuietHours(): boolean {
  const h = easternHour();
  return !(h >= 9 && h < 21);
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isDuplicate(
  admin: ReturnType<typeof createClient>,
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

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return jsonResponse(
      { ok: false, error: 'twilio_not_configured' },
      500,
    );
  }

  const ok = await isAuthorized(req);
  if (!ok) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

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

  const { to_phone_e164, body, idempotency_key } = parsed.data;

  // Quiet hours guard.
  if (isQuietHours()) {
    return jsonResponse({ ok: true, sent: false, reason: 'quiet_hours' }, 200);
  }

  const idempotencyHash = await sha256(idempotency_key);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Dedupe check.
  if (await isDuplicate(admin, idempotencyHash)) {
    return jsonResponse({ ok: true, sent: false, reason: 'duplicate_idempotency_key' }, 200);
  }

  try {
    const result = await withLogging({
      source: 'twilio',
      event: 'sms.send',
      // We hash the idempotency_key (not the message body) so future calls
      // with the same key can be detected via payload_hash equality.
      payload: idempotency_key,
      fn: async () => {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const basic = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

        const form = new URLSearchParams({
          From: TWILIO_FROM,
          To: to_phone_e164,
          Body: body,
        });

        const res = await fetch(url, {
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

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[send-twilio-sms] failed', message);
    return jsonResponse({ ok: false, sent: false, error: message }, 500);
  }
});
