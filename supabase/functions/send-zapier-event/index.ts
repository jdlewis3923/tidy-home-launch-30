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
