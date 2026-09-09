// Tidy — admin-stripe-event-replay.
//
// Recovery path for a Stripe event whose stripe_events row is not 'processed'
// (a charged customer with no subscription). The event is re-fetched from
// Stripe by id inside stripe-webhook, so nothing here can inject a payload.
//
// Body: { stripe_event_id: "evt_..." }
// Auth: service-role bearer OR a verified admin session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  let stripeEventId = '';
  try {
    const body = await req.json();
    stripeEventId = String(body?.stripe_event_id ?? '').trim();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json_body' }, 400);
  }
  if (!/^evt_[A-Za-z0-9]+$/.test(stripeEventId)) {
    return jsonResponse({ ok: false, error: 'stripe_event_id must look like evt_...' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const res = await vendorFetch(`${SUPABASE_URL}/functions/v1/stripe-webhook`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'x-internal-replay': stripeEventId,
    },
    body: '{}',
  });
  const text = await res.text();

  const { data: row } = await admin
    .from('stripe_events')
    .select('id, stripe_event_id, event_type, status, error_message, replay_count, last_replay_at, processed_at')
    .eq('stripe_event_id', stripeEventId)
    .maybeSingle();

  if (!res.ok) {
    return jsonResponse({
      ok: false, error: 'replay_failed', http_status: res.status,
      detail: text.slice(0, 400), event: row ?? null,
    }, 502);
  }

  return jsonResponse({
    ok: row?.status === 'processed',
    webhook_response: text.slice(0, 200),
    event: row ?? null,
  }, row?.status === 'processed' ? 200 : 502);
});
