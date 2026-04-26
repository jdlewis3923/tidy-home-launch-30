// Tidy — Server-side conversion fan-out (Phase 7).
//
// Mirrors a single business event to:
//   - Google Analytics 4 (Measurement Protocol)
//   - Meta Conversions API
//   - Google Ads Click Conversion (via Measurement Protocol — server-side
//     enhanced conversions are submitted through GA4 then linked in Ads UI)
//
// Each platform is best-effort and independent: a missing/blocked secret
// causes a clean "skipped" result, NOT a 500. Any platform value that
// starts with "BLOCKED_" is treated as not configured.
//
// Auth: service-role key OR admin JWT. Same model as send-zapier-event.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Marketing secrets (any may be missing or BLOCKED_*).
const GA4_MEASUREMENT_ID = Deno.env.get('GA4_MEASUREMENT_ID') ?? '';
const GA4_API_SECRET = Deno.env.get('GA4_API_SECRET') ?? ''; // optional, MP requires it
const GOOGLE_ADS_CONVERSION_ID = Deno.env.get('GOOGLE_ADS_CONVERSION_ID') ?? '';
const GOOGLE_ADS_CONVERSION_LABELS_RAW = Deno.env.get('GOOGLE_ADS_CONVERSION_LABELS') ?? '';
const META_PIXEL_ID = Deno.env.get('META_PIXEL_ID') ?? '';
const META_CAPI_ACCESS_TOKEN = Deno.env.get('META_CAPI_ACCESS_TOKEN') ?? '';
const META_TEST_EVENT_CODE = Deno.env.get('META_TEST_EVENT_CODE') ?? ''; // optional

// ---------- helpers ----------

const isUsable = (v: string) => v.length > 0 && !v.startsWith('BLOCKED_');

let _adsLabels: Record<string, string> | null = null;
function adsLabels(): Record<string, string> {
  if (_adsLabels) return _adsLabels;
  try {
    const parsed = JSON.parse(GOOGLE_ADS_CONVERSION_LABELS_RAW || '{}');
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && isUsable(v)) cleaned[k] = v;
    }
    _adsLabels = cleaned;
  } catch {
    _adsLabels = {};
  }
  return _adsLabels;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------- request schema ----------

const EventSchema = z.enum(['signup', 'lead', 'subscription', 'purchase']);

const BodySchema = z.object({
  event: EventSchema,
  // Stable per-user identifier for GA4 (auth user_id is fine).
  client_id: z.string().min(1).optional(),
  user_id: z.string().uuid().optional(),
  // Optional PII — hashed before sending to Meta.
  email: z.string().email().optional(),
  phone: z.string().optional(),
  // Conversion economics.
  value: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  // Click identifiers from the originating page (forward from cookies).
  gclid: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
  ip: z.string().optional(),
  user_agent: z.string().optional(),
  source_url: z.string().url().optional(),
});

type Body = z.infer<typeof BodySchema>;

// ---------- platform senders ----------

type PlatformResult =
  | { status: 'sent'; detail?: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

async function sendGA4(body: Body): Promise<PlatformResult> {
  if (!isUsable(GA4_MEASUREMENT_ID)) {
    return { status: 'skipped', reason: 'GA4_MEASUREMENT_ID missing or blocked' };
  }
  if (!isUsable(GA4_API_SECRET)) {
    return { status: 'skipped', reason: 'GA4_API_SECRET not configured (required by MP)' };
  }
  const cid = body.client_id ?? body.user_id ?? crypto.randomUUID();
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
    GA4_MEASUREMENT_ID,
  )}&api_secret=${encodeURIComponent(GA4_API_SECRET)}`;
  const eventName =
    body.event === 'signup'
      ? 'sign_up'
      : body.event === 'subscription'
        ? 'subscribe'
        : body.event;
  const params: Record<string, unknown> = {};
  if (typeof body.value === 'number') params.value = body.value;
  if (body.currency) params.currency = body.currency;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: cid,
      user_id: body.user_id,
      events: [{ name: eventName, params }],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { status: 'failed', error: `GA4 ${res.status}: ${text.slice(0, 200)}` };
  }
  return { status: 'sent', detail: `GA4 MP ${res.status}` };
}

async function sendGoogleAds(body: Body): Promise<PlatformResult> {
  if (!isUsable(GOOGLE_ADS_CONVERSION_ID)) {
    return { status: 'skipped', reason: 'GOOGLE_ADS_CONVERSION_ID missing or blocked' };
  }
  const labels = adsLabels();
  const label = labels[body.event];
  if (!label) {
    return {
      status: 'skipped',
      reason: `no usable conversion label for "${body.event}" (check GOOGLE_ADS_CONVERSION_LABELS — BLOCKED_* values are filtered)`,
    };
  }
  // Note: the official Google Ads Click Conversion API requires OAuth2 +
  // a developer token. Without those secrets, we cannot upload offline
  // conversions server-side. Document the gap rather than silently no-op.
  return {
    status: 'skipped',
    reason:
      'Google Ads server-side upload requires OAuth2 + developer token (not configured). Conversion fires client-side via GTM tag using AW-' +
      GOOGLE_ADS_CONVERSION_ID.replace(/^AW-/, '') +
      '/' +
      label,
  };
}

async function sendMetaCAPI(body: Body): Promise<PlatformResult> {
  if (!isUsable(META_PIXEL_ID)) {
    return { status: 'skipped', reason: 'META_PIXEL_ID missing or blocked' };
  }
  if (!isUsable(META_CAPI_ACCESS_TOKEN)) {
    return { status: 'skipped', reason: 'META_CAPI_ACCESS_TOKEN missing or blocked' };
  }
  const eventName =
    body.event === 'signup'
      ? 'CompleteRegistration'
      : body.event === 'lead'
        ? 'Lead'
        : body.event === 'subscription'
          ? 'Subscribe'
          : 'Purchase';
  const userData: Record<string, unknown> = {};
  if (body.email) userData.em = [await sha256Hex(body.email)];
  if (body.phone) userData.ph = [await sha256Hex(body.phone.replace(/\D/g, ''))];
  if (body.fbp) userData.fbp = body.fbp;
  if (body.fbc) userData.fbc = body.fbc;
  if (body.ip) userData.client_ip_address = body.ip;
  if (body.user_agent) userData.client_user_agent = body.user_agent;
  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: body.source_url,
    user_data: userData,
  };
  if (typeof body.value === 'number') {
    event.custom_data = { value: body.value, currency: body.currency };
  }
  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(
    META_PIXEL_ID,
  )}/events?access_token=${encodeURIComponent(META_CAPI_ACCESS_TOKEN)}`;
  const payload: Record<string, unknown> = { data: [event] };
  if (META_TEST_EVENT_CODE) payload.test_event_code = META_TEST_EVENT_CODE;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    return { status: 'failed', error: `Meta ${res.status}: ${text.slice(0, 250)}` };
  }
  return { status: 'sent', detail: `Meta ${res.status}` };
}

// ---------- auth ----------

async function isAuthorized(req: Request): Promise<boolean> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  // Direct service-role key match (rotation-safe across env + vault).
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: claims, error } = await sb.auth.getClaims(token);
    if (error || !claims?.claims) return false;
    // Any token whose claims declare service_role is accepted (covers
    // vault-stored placeholder JWTs minted for DB triggers).
    if (claims.claims.role === 'service_role') return true;
    const userId = claims.claims.sub as string | undefined;
    if (!userId) return false;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: row } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    return !!row;
  } catch {
    return false;
  }
}

// ---------- handler ----------

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  }

  if (!(await isAuthorized(req))) {
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

  const body = parsed.data;

  const result = await withLogging({
    source: 'meta_capi', // closest existing log source; covers GA4/Ads too
    event: `track_conversion.${body.event}`,
    payload: { event: body.event, has_email: !!body.email, has_value: typeof body.value === 'number' },
    fn: async () => {
      const [ga4, ads, meta] = await Promise.all([
        sendGA4(body).catch((e) => ({ status: 'failed' as const, error: String(e) })),
        sendGoogleAds(body).catch((e) => ({ status: 'failed' as const, error: String(e) })),
        sendMetaCAPI(body).catch((e) => ({ status: 'failed' as const, error: String(e) })),
      ]);
      return {
        ok: true,
        event: body.event,
        platforms: { ga4, google_ads: ads, meta_capi: meta },
      };
    },
  });

  return jsonResponse(result, 200);
});
