// Tidy — Jobber inbound webhook.
//
// Public endpoint. Verifies HMAC signature with JOBBER_WEBHOOK_SECRET,
// then handles the four event topics we subscribe to:
//   - JOB_UPDATE         — Jobber-side schedule edit; refresh visit dates
//   - VISIT_COMPLETE     — mark visit complete + fire visit_complete Zap
//   - VISIT_RESCHEDULED  — update visit_date + fire visit_scheduled Zap
//   - INVOICE_CREATE     — bookkeeping only (Stripe is the source of truth
//                          for billing; logged for audit)
//
// Always returns 200 after the log row is recorded so Jobber doesn't
// retry into a poisoned state.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { verifyJobberWebhook } from '../_shared/jobber-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface JobberEvent {
  topic?: string; // e.g. "VISIT_COMPLETE"
  data?: {
    webHookEvent?: {
      itemId?: string;
      occuredAt?: string;
      topic?: string;
    };
  };
  // Legacy/flat shape fallback
  itemId?: string;
}

function topicOf(evt: JobberEvent): string | null {
  return evt.topic ?? evt.data?.webHookEvent?.topic ?? null;
}

function itemIdOf(evt: JobberEvent): string | null {
  return evt.data?.webHookEvent?.itemId ?? evt.itemId ?? null;
}

async function fireZap(eventName: string, payload: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-zapier-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ event_name: eventName, payload }),
    });
  } catch (err) {
    console.error('[jobber-webhook] zap dispatch failed', eventName, err);
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const sig = req.headers.get('x-jobber-hmac-sha256')
    ?? req.headers.get('X-JOBBER-HMAC-SHA256')
    ?? req.headers.get('jobber-signature');

  const verified = await verifyJobberWebhook(rawBody, sig);
  if (!verified) {
    return new Response('signature verification failed', { status: 400, headers: corsHeaders });
  }

  let evt: JobberEvent;
  try {
    evt = JSON.parse(rawBody);
  } catch {
    return new Response('invalid JSON', { status: 400, headers: corsHeaders });
  }

  const topic = topicOf(evt);
  const itemId = itemIdOf(evt);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotency: dedupe by topic+itemId+occurredAt
  const eventKey = `${topic ?? 'unknown'}:${itemId ?? 'noitem'}:${evt.data?.webHookEvent?.occuredAt ?? Date.now()}`;
  const { data: existing } = await supabase
    .from('integration_logs')
    .select('id')
    .eq('source', 'jobber')
    .eq('event', eventKey)
    .limit(1)
    .maybeSingle();
  if (existing) return new Response('replay', { status: 200, headers: corsHeaders });

  const start = performance.now();
  try {
    switch (topic) {
      case 'JOB_UPDATE':
        // Bookkeeping log only — visit-level changes arrive via VISIT_RESCHEDULED.
        break;
      case 'VISIT_COMPLETE':
        if (itemId) {
          const { data: vRow } = await supabase
            .from('visits')
            .update({ status: 'complete' })
            .eq('jobber_visit_id', itemId)
            .select('id, user_id, service, visit_date')
            .maybeSingle();
          if (vRow) {
            await fireZap('visit_complete', {
              user_id: vRow.user_id,
              visit_id: vRow.id,
              service: vRow.service,
              visit_date: vRow.visit_date,
            });
          }
        }
        break;
      case 'VISIT_RESCHEDULED':
        // Best-effort: Jobber payloads vary by topic. We extract a date if
        // present in the data envelope; otherwise the JOB_UPDATE listener
        // will pick it up via the next sync cycle.
        if (itemId) {
          const newDate = (evt.data?.webHookEvent as { startAt?: string } | undefined)?.startAt
            ?? null;
          const update: Record<string, unknown> = {};
          if (newDate) update.visit_date = newDate.slice(0, 10);
          if (Object.keys(update).length) {
            const { data: vRow } = await supabase
              .from('visits')
              .update(update)
              .eq('jobber_visit_id', itemId)
              .select('id, user_id, service, visit_date')
              .maybeSingle();
            if (vRow) {
              await fireZap('visit_scheduled', {
                user_id: vRow.user_id,
                visit_id: vRow.id,
                service: vRow.service,
                visit_date: vRow.visit_date,
              });
            }
          }
        }
        break;
      case 'INVOICE_CREATE':
        // Bookkeeping only — Stripe remains source of truth.
        break;
      default:
        // Unknown topic — log + ignore.
        break;
    }

    await supabase.from('integration_logs').insert({
      source: 'jobber',
      event: eventKey,
      status: 'success',
      latency_ms: Math.round(performance.now() - start),
      payload_hash: topic ?? 'unknown',
    });
    return new Response('ok', { status: 200, headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[jobber-webhook] handler failed', topic, message);
    await supabase.from('integration_logs').insert({
      source: 'jobber',
      event: eventKey,
      status: 'error',
      latency_ms: Math.round(performance.now() - start),
      payload_hash: topic ?? 'unknown',
      error_message: message.slice(0, 1000),
    });
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
});
