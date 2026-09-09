import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — producer: "a job you had today is off".
//
// Dispatched by the public.visits_notify_pro_canceled_today trigger the moment a
// cancellation lands on a visit scheduled for today, so the Pro does not drive
// to a house nobody is expecting them at.
//
// visit_canceled_today is time-critical: push first, SMS fallback, no window.
// Idempotency is the claim row keyed on the visit, so a repeated dispatch of the
// same cancellation notifies once.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { notifyPro } from '../_shared/pro-notify.ts';
import { etTime } from '../_shared/pro-day-digest.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (!(await isCronAuthorized(req))) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const visitId = typeof body.visit_id === 'string' ? body.visit_id : null;
  if (!visitId) return jsonResponse({ ok: false, error: 'visit_id required' }, 400);

  console.log('[notify-pro-visit-canceled] entry', visitId);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: visit, error } = await admin
    .from('visits')
    .select('id, assigned_pro_id, scheduled_start, service_type, street, zip, status')
    .eq('id', visitId)
    .maybeSingle();
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);
  if (!visit) return jsonResponse({ ok: false, error: 'visit_not_found' }, 404);

  const v = visit as {
    assigned_pro_id: string | null;
    scheduled_start: string | null;
    service_type: string | null;
    street: string | null;
    zip: string | null;
  };
  if (!v.assigned_pro_id) return jsonResponse({ ok: true, skipped: 'no_assigned_pro' });

  // The error matters as much as the value: a failed RPC returns null, which
  // used to read as "already notified" and return 200 ok — so a Pro drove to a
  // canceled job and nothing anywhere recorded it. The caller is a fire-and-
  // forget trigger, so this response is the only place the truth can live.
  const { data: claimed, error: claimErr } = await admin.rpc('claim_pro_notification', {
    _contractor_id: v.assigned_pro_id,
    _kind: 'visit_canceled_today',
    _scope: visitId,
  });
  if (claimErr) {
    await admin.from('admin_alerts').insert({
      alert_type: 'pro_notification_undeliverable',
      title: 'A Pro was not told a same-day job was canceled',
      body: `claim_pro_notification failed for visit ${visitId}: ${claimErr.message}`,
      context: { visit_id: visitId, contractor_id: v.assigned_pro_id, kind: 'visit_canceled_today' },
    });
    return jsonResponse({ ok: false, error: `claim_failed: ${claimErr.message}`, visit_id: visitId }, 500);
  }
  if (claimed !== true) return jsonResponse({ ok: true, skipped: 'already_notified' });


  const where = [v.street, v.zip].filter(Boolean).join(', ') || 'the address in your app';
  const result = await notifyPro(admin, {
    contractor_id: v.assigned_pro_id,
    kind: 'visit_canceled_today',
    title: `Canceled: your ${etTime(v.scheduled_start)} job today`,
    body: `${where} is off. Do not head there. Your schedule in the app is up to date.`,
    url: '/pro/schedule',
    idempotency_key: `visit_canceled_today:${visitId}`,
    context: { visit_id: visitId },
  });

  return jsonResponse({ ok: result.ok, visit_id: visitId, ...result });
});
