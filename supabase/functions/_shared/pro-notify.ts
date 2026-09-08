// Tidy — in-app + web-push notification helper for Pros.
//
// Every Pro-facing notification lands in public.pro_notifications (the bell
// feed on /pro). Delivery to the contractor's phone happens THROUGH the Pro
// Portal app (web push), never as a separate app and never as a plain text
// unless push cannot reach them.
//
// Rules (Phase 5):
//   - Push is the primary channel for everything.
//   - TIME-CRITICAL notifications (URGENT_PRO_KINDS below) fall back to SMS
//     when there is no active push subscription or the push itself fails.
//     The fallback goes through send-twilio-sms so it inherits the send window
//     and the outbox — there is no seventh SMS path.
//   - Never double-send: SMS is only attempted when push did NOT deliver.
//   - Non-urgent pushes respect the same 08:00-18:00 ET, Mon-Sat courtesy
//     window. Outside it they are HELD in public.pro_push_outbox and released
//     by sms-outbox-release. Urgent pushes ignore the window entirely.
//   - A misconfigured push path is never reported as a delivered notification.

import { isWindowOpen, nextOpenWindow, closedReason } from './sms-window.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Time-critical: the contractor is standing in someone's house, or the work
 * happens within a day. These bypass the courtesy window and fall back to SMS.
 */
export const URGENT_PRO_KINDS = new Set([
  'addon_approved',      // customer said yes — the Pro is waiting to start
  'addon_declined',      // customer said no — the Pro is waiting to move on
  'addon_expired',       // the 15-minute walkaway timer ran out
  'visit_assigned_today',// the job is today
  'visit_tomorrow',      // the visit is tomorrow
  'visit_substitution',  // a job moved on or off this Pro's route
  'visit_canceled_today',
]);

export type PushOutcome =
  | 'sent'
  | 'no_subscription'
  | 'failed'
  | 'not_configured'
  | 'held_for_window';

export type SmsOutcome = 'sent' | 'queued' | 'failed' | 'no_phone' | 'not_needed';

export type ProNotification = {
  contractor_id: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  context?: Record<string, unknown>;
  /** Overrides the URGENT_PRO_KINDS classification when set. */
  urgent?: boolean;
  /** Text used for the SMS fallback; defaults to "title — body". */
  sms_body?: string;
  /** Stable key so a retried caller cannot double-deliver. */
  idempotency_key?: string;
};

export type ProNotifyResult = {
  ok: boolean;
  recorded: boolean;
  urgent: boolean;
  push: PushOutcome;
  sms: SmsOutcome;
  detail?: string;
};

function defaultKey(n: ProNotification): string {
  const stamp = new Date().toISOString().slice(0, 16); // minute precision
  return n.idempotency_key ?? `pro:${n.kind}:${n.contractor_id}:${stamp}`;
}

// deno-lint-ignore no-explicit-any
async function sendPush(n: ProNotification): Promise<{ outcome: PushOutcome; detail?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-pwa-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: n.contractor_id,
        title: n.title,
        body: n.body ?? '',
        url: n.url ?? '/pro',
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean; sent?: number; error?: string;
    };
    if (res.ok && payload.ok === true && (payload.sent ?? 0) > 0) return { outcome: 'sent' };
    if (res.status === 404 || payload.error === 'no_active_subscription') {
      return { outcome: 'no_subscription', detail: 'no device registered' };
    }
    if (payload.error === 'PWA_VAPID_PRIVATE_KEY not configured') {
      return { outcome: 'not_configured', detail: payload.error };
    }
    return { outcome: 'failed', detail: `HTTP ${res.status} ${String(payload.error ?? '').slice(0, 200)}` };
  } catch (e) {
    return { outcome: 'failed', detail: (e as Error).message };
  }
}

// deno-lint-ignore no-explicit-any
async function smsFallback(admin: any, n: ProNotification, key: string): Promise<{ outcome: SmsOutcome; detail?: string }> {
  const { data: pro } = await admin
    .from('applicants')
    .select('phone')
    .eq('contractor_id', n.contractor_id)
    .maybeSingle();
  const phone = (pro as { phone?: string } | null)?.phone?.trim();
  if (!phone) return { outcome: 'no_phone', detail: 'pro has no phone on file' };

  const text = n.sms_body ?? [n.title, n.body].filter(Boolean).join(' — ');
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        to_phone_e164: phone.startsWith('+') ? phone : `+1${phone.replace(/\D/g, '')}`,
        body: text.slice(0, 1500),
        idempotency_key: `sms-fallback:${key}`,
        template_name: `pro-${n.kind}`,
        triggered_by: 'pro-notify-fallback',
      }),
    });
    if (res.status === 202) return { outcome: 'queued', detail: 'outside send window — parked in the outbox' };
    if (res.ok) return { outcome: 'sent' };
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    return { outcome: 'failed', detail: `HTTP ${res.status} ${detail}` };
  } catch (e) {
    return { outcome: 'failed', detail: (e as Error).message };
  }
}

// deno-lint-ignore no-explicit-any
export async function notifyPro(admin: any, n: ProNotification): Promise<ProNotifyResult> {
  const urgent = n.urgent ?? URGENT_PRO_KINDS.has(n.kind);
  const key = defaultKey(n);

  const { error } = await admin.from('pro_notifications').insert({
    contractor_id: n.contractor_id,
    kind: n.kind,
    title: n.title,
    body: n.body ?? null,
    url: n.url ?? null,
    context: n.context ?? {},
  });
  if (error) {
    console.error('[pro-notify] insert failed', error.message);
    return { ok: false, recorded: false, urgent, push: 'failed', sms: 'not_needed', detail: error.message };
  }

  // Non-urgent, outside the courtesy window: hold the push, don't drop it.
  if (!urgent && !isWindowOpen()) {
    const releaseAfter = nextOpenWindow();
    const { error: qErr } = await admin.from('pro_push_outbox').insert({
      contractor_id: n.contractor_id,
      kind: n.kind,
      title: n.title,
      body: n.body ?? null,
      url: n.url ?? '/pro',
      context: n.context ?? {},
      idempotency_key: key,
      queued_reason: closedReason() ?? 'quiet_hours',
      release_after: releaseAfter.toISOString(),
    });
    // 23505 = already parked by an earlier identical call.
    if (qErr && (qErr as { code?: string }).code !== '23505') {
      console.error('[pro-notify] could not hold push', qErr.message);
      return { ok: false, recorded: true, urgent, push: 'failed', sms: 'not_needed', detail: qErr.message };
    }
    console.log('[pro-notify] push held until', releaseAfter.toISOString(), n.kind);
    return { ok: true, recorded: true, urgent, push: 'held_for_window', sms: 'not_needed' };
  }

  const push = await sendPush(n);

  // Push landed: never also text. That is the whole point of the app.
  if (push.outcome === 'sent') {
    return { ok: true, recorded: true, urgent, push: 'sent', sms: 'not_needed' };
  }

  console.error('[pro-notify] push not delivered', n.kind, push.outcome, push.detail ?? '');

  if (!urgent) {
    // Not time-critical: the bell feed is enough, but the failure is visible.
    await admin.from('admin_alerts').insert({
      alert_type: 'pro_push_failed',
      title: 'A Pro notification push was not delivered',
      body: `${n.kind}: ${push.outcome}${push.detail ? ` — ${push.detail}` : ''}`,
      context: { contractor_id: n.contractor_id, kind: n.kind, urgent: false },
    }).then(() => {}, () => {});
    return { ok: false, recorded: true, urgent, push: push.outcome, sms: 'not_needed', detail: push.detail };
  }

  const sms = await smsFallback(admin, n, key);
  const delivered = sms.outcome === 'sent' || sms.outcome === 'queued';
  if (!delivered) {
    await admin.from('admin_alerts').insert({
      alert_type: 'pro_notification_undeliverable',
      title: 'A time-critical Pro notification reached nobody',
      body: `${n.kind}: push ${push.outcome}, sms ${sms.outcome}${sms.detail ? ` — ${sms.detail}` : ''}`,
      context: { contractor_id: n.contractor_id, kind: n.kind, urgent: true },
    }).then(() => {}, () => {});
  }
  return {
    ok: delivered,
    recorded: true,
    urgent,
    push: push.outcome,
    sms: sms.outcome,
    detail: [push.detail, sms.detail].filter(Boolean).join(' | ') || undefined,
  };
}
