import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — admin-failure-review.
//
// The reader that admin_alerts, stripe_events and sms_delivery_events never
// had. One admin-only call returns everything that failed and is not yet
// resolved, plus the cron health table, so /admin/health can show it.
//
// Auth: service-role bearer OR a verified admin session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [alerts, stripeFailed, smsFailed, outbox, cron] = await Promise.all([
    admin.from('admin_alerts')
      .select('id, alert_type, title, body, context, created_at')
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('stripe_events')
      .select('id, stripe_event_id, event_type, status, error_message, livemode, replay_count, last_replay_at, received_at')
      .neq('status', 'processed')
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(100),
    admin.from('sms_delivery_events')
      .select('id, message_sid, message_status, to_number, error_code, error_message, received_at')
      .in('message_status', ['failed', 'undelivered'])
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(100),
    admin.from('sms_outbox')
      .select('id, to_phone_e164, template_name, status, attempts, queued_reason, release_after, last_error, created_at')
      .in('status', ['queued', 'failed', 'canceled'])
      .order('created_at', { ascending: false })
      .limit(100),
    admin.rpc('admin_cron_health'),
  ]);

  return jsonResponse({
    ok: true,
    as_of: new Date().toISOString(),
    window: '7d',
    open_alerts: alerts.data ?? [],
    stripe_failures: stripeFailed.data ?? [],
    sms_delivery_failures: smsFailed.data ?? [],
    sms_outbox: outbox.data ?? [],
    cron_jobs: cron.data ?? [],
    errors: [alerts.error, stripeFailed.error, smsFailed.error, outbox.error, cron.error]
      .filter(Boolean)
      .map((e) => (e as { message: string }).message),
  });
});
