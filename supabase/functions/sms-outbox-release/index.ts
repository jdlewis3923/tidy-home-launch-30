// Tidy — sms-outbox-release (cron, every 15 minutes).
//
// Also drains public.pro_push_outbox: non-urgent Pro pushes held outside the
// 08:00-18:00 ET Mon-Sat courtesy window. Same rule — held, never dropped.
//
// Drains public.sms_outbox: any message parked because it hit quiet hours or a
// Sunday is sent as soon as the window opens. Nothing is destroyed; a message
// that Twilio rejects is marked failed with the vendor error and raises an
// admin alert after 3 attempts.
//
// Auth: cron service credential (x-cron-key) or service-role bearer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { isWindowOpen, nextOpenWindow } from '../_shared/sms-window.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MAX_ATTEMPTS = 3;
const BATCH = 50;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!(await isCronAuthorized(req))) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Expiry first: never deliver a message about a moment that has passed --
  //
  // A 15-minute add-on approval link parked at 18:20 on Saturday used to be
  // delivered Monday at 08:00, pointing at a request that died 38 hours before.
  // Expiry is the message's OWN deadline, never a flat clock: the send window
  // skips Sunday, so anything parked Saturday evening legitimately waits ~37
  // hours for Monday 08:00 and a hard 24h ceiling destroyed all of it — on-my-
  // way texts, add-on approvals, support replies — in the most common parking
  // window a Mon-Sat business has.
  //
  // Rows queued before expires_at existed have no deadline of their own, so the
  // only safe fallback is measured from their own release time: still unsent a
  // full day after the window they were waiting for opened.
  const nowIso = new Date().toISOString();
  const GRACE_HOURS_AFTER_RELEASE = 24;
  const staleReleaseIso = new Date(
    Date.now() - GRACE_HOURS_AFTER_RELEASE * 3_600_000,
  ).toISOString();

  const { data: expiredRows } = await admin
    .from('sms_outbox')
    .select('id, template_name, expires_at, created_at, release_after')
    .eq('status', 'queued')
    .or(`expires_at.lte.${nowIso},release_after.lte.${staleReleaseIso}`)
    .limit(500);

  let canceled = 0;
  for (const row of expiredRows ?? []) {
    const expired = !!row.expires_at && row.expires_at <= nowIso;
    // Belt and braces: never cancel a row that is simply waiting for Monday.
    if (!expired && (!row.release_after || row.release_after > staleReleaseIso)) continue;
    const reason = expired
      ? `canceled: expired at ${row.expires_at}`
      : `canceled: still unsent ${GRACE_HOURS_AFTER_RELEASE}h after its release time (${row.release_after})`;
    const { error: cErr } = await admin.from('sms_outbox').update({
      status: 'canceled',
      last_error: reason,
      updated_at: nowIso,
    }).eq('id', row.id).eq('status', 'queued');
    if (!cErr) canceled++;
  }


  // Outside the window nothing else is sent — the rest stays parked.
  if (!isWindowOpen()) {
    const { count } = await admin
      .from('sms_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');
    const { count: pushQueued } = await admin
      .from('pro_push_outbox')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');
    return jsonResponse({
      ok: true, window_open: false, queued: count ?? 0, push_queued: pushQueued ?? 0,
      canceled, next_window: nextOpenWindow().toISOString(),
    });
  }



  const { data: rows, error } = await admin
    .from('sms_outbox')
    .select('*')
    .eq('status', 'queued')
    .lte('release_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH);
  if (error) return jsonResponse({ ok: false, error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const row of rows ?? []) {
    let httpStatus = 0;
    let payload: Record<string, unknown> = {};
    let errMessage: string | null = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_phone_e164: row.to_phone_e164,
          body: row.body ?? undefined,
          content_sid: row.content_sid ?? undefined,
          content_variables: row.content_variables ?? undefined,
          idempotency_key: row.idempotency_key,
          template_name: row.template_name ?? undefined,
          triggered_by: row.triggered_by ?? 'sms-outbox-release',
          skip_window: true,
        }),
      });
      httpStatus = res.status;
      payload = await res.json().catch(() => ({}));
      if (!res.ok || payload.ok !== true) {
        errMessage = `send-twilio-sms ${res.status}: ${String(payload.error ?? '').slice(0, 300)}`;
      }
    } catch (e) {
      errMessage = (e as Error).message;
    }

    const attempts = (row.attempts as number) + 1;
    if (!errMessage) {
      await admin.from('sms_outbox').update({
        status: 'sent',
        attempts,
        twilio_sid: (payload.message_sid as string) ?? null,
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      sent++;
      results.push({ id: row.id, to: row.to_phone_e164, status: 'sent', twilio_sid: payload.message_sid ?? null });
      continue;
    }

    const terminal = attempts >= MAX_ATTEMPTS;
    await admin.from('sms_outbox').update({
      status: terminal ? 'failed' : 'queued',
      attempts,
      last_error: errMessage.slice(0, 500),
      // Backoff: 15 min per attempt.
      release_after: new Date(Date.now() + attempts * 15 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    failed++;
    results.push({ id: row.id, to: row.to_phone_e164, status: terminal ? 'failed' : 'retry', http: httpStatus, error: errMessage });

    if (terminal) {
      await admin.from('admin_alerts').insert({
        alert_type: 'sms_outbox_failed',
        title: 'A queued text could not be delivered',
        body: `${row.template_name ?? 'sms'} to ${row.to_phone_e164} failed ${attempts} times: ${errMessage.slice(0, 200)}`,
        context: { outbox_id: row.id, triggered_by: row.triggered_by },
      }).then(() => {}, () => {});
    }
  }

  // ------------------------- held Pro pushes -------------------------------
  const { data: pushRows } = await admin
    .from('pro_push_outbox')
    .select('*')
    .eq('status', 'queued')
    .lte('release_after', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(BATCH);

  let pushSent = 0;
  let pushFailed = 0;
  const pushResults: Array<Record<string, unknown>> = [];
  for (const row of pushRows ?? []) {
    let errMessage: string | null = null;
    let httpStatus = 0;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-pwa-push`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: row.contractor_id,
          title: row.title,
          body: row.body ?? '',
          url: row.url ?? '/pro',
        }),
      });
      httpStatus = res.status;
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; sent?: number; error?: string };
      if (!res.ok || payload.ok !== true || (payload.sent ?? 0) < 1) {
        errMessage = `send-pwa-push ${res.status}: ${String(payload.error ?? '').slice(0, 200)}`;
      }
    } catch (e) {
      errMessage = (e as Error).message;
    }

    const attempts = (row.attempts as number) + 1;
    if (!errMessage) {
      await admin.from('pro_push_outbox').update({
        status: 'sent', attempts, sent_at: new Date().toISOString(), last_error: null,
      }).eq('id', row.id);
      pushSent++;
      pushResults.push({ id: row.id, kind: row.kind, status: 'sent' });
      continue;
    }
    const terminal = attempts >= MAX_ATTEMPTS;
    await admin.from('pro_push_outbox').update({
      status: terminal ? 'failed' : 'queued',
      attempts,
      last_error: errMessage.slice(0, 500),
      release_after: new Date(Date.now() + attempts * 15 * 60 * 1000).toISOString(),
    }).eq('id', row.id);
    pushFailed++;
    pushResults.push({ id: row.id, kind: row.kind, status: terminal ? 'failed' : 'retry', http: httpStatus, error: errMessage });
    if (terminal) {
      await admin.from('admin_alerts').insert({
        alert_type: 'pro_push_outbox_failed',
        title: 'A held Pro notification could not be pushed',
        body: `${row.kind} failed ${attempts} times: ${errMessage.slice(0, 200)}`,
        context: { outbox_id: row.id, contractor_id: row.contractor_id },
      }).then(() => {}, () => {});
    }
  }

  return jsonResponse({
    ok: true, window_open: true, considered: rows?.length ?? 0, sent, failed, canceled, results,
    push_considered: pushRows?.length ?? 0, push_sent: pushSent, push_failed: pushFailed, push_results: pushResults,
  });
});
