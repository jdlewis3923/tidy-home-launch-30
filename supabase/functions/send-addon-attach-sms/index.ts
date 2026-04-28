// Tidy — Send the "Add to your next visit?" SMS.
//
// Inputs: { user_id, jobber_visit_id?, days_until_visit?, visit_date?, service? }
// Suppression order:
//   1. profiles.sms_preference / sms_opt_out  (via shouldSendSms-style logic inline)
//   2. weekly customer (subscriptions.frequency = 'weekly')
//   3. first 14 days after signup (first_cycle)
//   4. last addon_sms_log within 28 days
//   5. quiet hours / Sunday (delegated to send-twilio-sms)
//   6. payment failing → check subscriptions.status
//   7. 3+ pending_visit attaches already
//
// Variant pick (lifetime addon count via addon_attaches):
//   - count = 0 + created < 90 days  → A (default)
//   - 0–1 + created ≥ 90 days        → B (specific suggestion)
//   - ≥ 2                             → C (repeat)
//
// Service-role only.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { preferenceAllows } from '../_shared/sms-policy.ts';
import { isServiceOrZapAuthorized } from '../_shared/zap-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TEMPLATE_A = Deno.env.get('TWILIO_ADDON_TEMPLATE_A') ?? 'HX1b3c5e31f07d66994a37671a1e2f585a';
const TEMPLATE_B = Deno.env.get('TWILIO_ADDON_TEMPLATE_B') ?? 'HX668f4e5e2adce7025bcec50c1891951c';
const TEMPLATE_C = Deno.env.get('TWILIO_ADDON_TEMPLATE_C') ?? 'HXac9b403c650bc5d778124434952481a5';

const BodySchema = z.object({
  user_id: z.string().uuid(),
  jobber_visit_id: z.string().optional(),
  visit_date: z.string().optional(),
  service: z.enum(['cleaning', 'lawn', 'detailing']).optional(),
});

// Map customer-facing service to addon_catalog services key.
const SERVICE_DB_KEY: Record<string, string> = {
  cleaning: 'cleaning',
  lawn: 'lawn',
  detailing: 'detail',
};

function isAuthorized(req: Request): boolean {
  return isServiceOrZapAuthorized(req);
}

async function logSuppress(admin: any, user_id: string, jobber_visit_id: string | undefined, reason: string, ctx: Record<string, unknown> = {}) {
  await admin.from('addon_sms_log').insert({
    user_id, jobber_visit_id: jobber_visit_id ?? null,
    suppressed_at: new Date().toISOString(),
    suppression_reason: reason, context: ctx,
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  if (!isAuthorized(req)) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: 'validation_failed' }, 400);
  const { user_id, jobber_visit_id, visit_date, service } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Profile
  const { data: profile } = await admin.from('profiles')
    .select('sms_preference, sms_opt_out, first_name, phone, created_at')
    .eq('user_id', user_id).maybeSingle();
  if (!profile) {
    return jsonResponse({ ok: true, suppressed: true, reason: 'profile_not_found' });
  }
  if (profile.sms_opt_out) {
    await logSuppress(admin, user_id, jobber_visit_id, 'opted_out');
    return jsonResponse({ ok: true, suppressed: true, reason: 'opted_out' });
  }
  const prefCheck = preferenceAllows(profile.sms_preference, 'addon_attach');
  if (!prefCheck.allow) {
    await logSuppress(admin, user_id, jobber_visit_id, prefCheck.reason!);
    return jsonResponse({ ok: true, suppressed: true, reason: prefCheck.reason });
  }
  if (!profile.phone) {
    return jsonResponse({ ok: true, suppressed: true, reason: 'no_phone' });
  }

  // 2. Weekly customer suppression
  const { data: sub } = await admin.from('subscriptions')
    .select('frequency, status').eq('user_id', user_id).maybeSingle();
  if (sub?.frequency === 'weekly') {
    await logSuppress(admin, user_id, jobber_visit_id, 'weekly_customer');
    return jsonResponse({ ok: true, suppressed: true, reason: 'weekly_customer' });
  }
  if (sub?.status && ['past_due', 'unpaid', 'canceled'].includes(sub.status)) {
    await logSuppress(admin, user_id, jobber_visit_id, 'payment_failing');
    return jsonResponse({ ok: true, suppressed: true, reason: 'payment_failing' });
  }

  // 3. First 14 days after signup
  const ageMs = Date.now() - new Date(profile.created_at).getTime();
  if (ageMs < 14 * 24 * 60 * 60 * 1000) {
    await logSuppress(admin, user_id, jobber_visit_id, 'first_cycle');
    return jsonResponse({ ok: true, suppressed: true, reason: 'first_cycle' });
  }

  // 4. Last addon SMS within 28 days
  const since28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin.from('addon_sms_log')
    .select('id').eq('user_id', user_id).not('sent_at', 'is', null)
    .gte('sent_at', since28).limit(1);
  if (recent && recent.length > 0) {
    await logSuppress(admin, user_id, jobber_visit_id, 'recent_addon_sms_28d');
    return jsonResponse({ ok: true, suppressed: true, reason: 'recent_addon_sms_28d' });
  }

  // 5. 3+ pending attaches
  const { count: pendingCount } = await admin.from('addon_attaches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id).eq('status', 'pending_visit');
  if ((pendingCount ?? 0) >= 3) {
    await logSuppress(admin, user_id, jobber_visit_id, 'three_or_more_pending');
    return jsonResponse({ ok: true, suppressed: true, reason: 'three_or_more_pending' });
  }

  // 6. Lifetime addon count → variant pick
  const { count: lifetimeAddons } = await admin.from('addon_attaches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user_id).in('status', ['pending_visit', 'completed']);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const lifetime = lifetimeAddons ?? 0;
  let variant: 'A' | 'B' | 'C';
  if (lifetime >= 2) variant = 'C';
  else if (ageDays >= 90 && lifetime <= 1) variant = 'B';
  else variant = 'A';

  // 7. Mint token
  const tokenResp = await fetch(`${SUPABASE_URL}/functions/v1/mint-addon-token`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id }),
  });
  const tokenJson = await tokenResp.json();
  if (!tokenResp.ok || !tokenJson.token) {
    return jsonResponse({ ok: false, error: 'token_mint_failed', detail: tokenJson }, 500);
  }
  const token = tokenJson.token as string;

  // Build template variables
  const firstName = profile.first_name ?? 'there';
  const serviceLabel = service ? service[0].toUpperCase() + service.slice(1) : 'visit';
  const dayDate = visit_date ?? 'soon';
  let templateSid = TEMPLATE_A;
  let variables: Record<string, string>;

  if (variant === 'A') {
    variables = { '1': firstName, '2': serviceLabel, '3': dayDate, '4': token };
    templateSid = TEMPLATE_A;
  } else if (variant === 'B') {
    // Pick cheapest active add-on for this customer's service tier from addon_catalog.
    const dbServiceKey = SERVICE_DB_KEY[service ?? 'cleaning'] ?? 'cleaning';
    const { data: catRows } = await admin.from('addon_catalog')
      .select('display_name, price_cents, services')
      .eq('is_active', true)
      .contains('services', [dbServiceKey])
      .order('price_cents', { ascending: true })
      .limit(1);
    const sugg = catRows?.[0]
      ? { name: (catRows[0].display_name as string).toLowerCase(), price: Math.round((catRows[0].price_cents as number) / 100) }
      : { name: 'add-on', price: 45 };
    variables = {
      '1': firstName, '2': serviceLabel, '3': dayDate,
      '4': sugg.name, '5': String(sugg.price), '6': token,
    };
    templateSid = TEMPLATE_B;
  } else {
    // Variant C — pull last addon name
    const { data: last } = await admin.from('addon_attaches')
      .select('addon_name').eq('user_id', user_id)
      .in('status', ['pending_visit', 'completed'])
      .order('attached_at', { ascending: false }).limit(1).maybeSingle();
    variables = {
      '1': firstName, '2': serviceLabel, '3': dayDate,
      '4': last?.addon_name?.toLowerCase() ?? 'add-on', '5': token,
    };
    templateSid = TEMPLATE_C;
  }

  // Send via send-twilio-sms
  const idem = `addon_${user_id}_${jobber_visit_id ?? 'no_visit'}_${new Date().toISOString().slice(0,10)}`;
  const smsResp = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_phone_e164: profile.phone,
      content_sid: templateSid,
      content_variables: variables,
      idempotency_key: idem,
    }),
  });
  const smsJson = await smsResp.json();

  if (!smsResp.ok || !smsJson.sent) {
    await logSuppress(admin, user_id, jobber_visit_id, smsJson.reason ?? 'twilio_send_failed', {
      variant, twilio: smsJson,
    });
    return jsonResponse({ ok: true, suppressed: true, reason: smsJson.reason ?? 'twilio_send_failed', detail: smsJson });
  }

  await admin.from('addon_sms_log').insert({
    user_id, jobber_visit_id: jobber_visit_id ?? null,
    sent_at: new Date().toISOString(),
    variant, twilio_content_sid: templateSid,
    twilio_message_id: smsJson.message_sid,
    context: { variables },
  });

  return jsonResponse({ ok: true, sent: true, variant, twilio_message_id: smsJson.message_sid });
});
