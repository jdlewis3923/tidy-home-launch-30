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
  if (req.method === 'GET' && new URL(req.url).searchParams.get('debug') === 'secret-fingerprint') {
    const s = Deno.env.get('JOBBER_WEBHOOK_SECRET') ?? '';
    const fp = s ? `${s.slice(0, 8)}...${s.slice(-5)} (len=${s.length})` : 'MISSING';
    console.log('[jobber-webhook] secret fingerprint', fp);
    return new Response(JSON.stringify({ fingerprint: fp }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
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
    // Helper: also reflect Jobber events into pro_visits + bump applicant counters.
    async function reflectToProVisits(action: 'complete' | 'cancel' | 'schedule', startAt?: string | null) {
      if (!itemId) return;
      // Find the assigned contractor via applicants.jobber_id (provided by payload if present).
      const assignedJobberUserId =
        (evt.data?.webHookEvent as { assignedUserId?: string } | undefined)?.assignedUserId ?? null;
      let contractorId: string | null = null;
      if (assignedJobberUserId) {
        const { data: app } = await supabase
          .from('applicants')
          .select('id, contractor_id')
          .eq('jobber_id', assignedJobberUserId)
          .maybeSingle();
        contractorId = app?.contractor_id ?? null;
      }

      const status = action === 'complete' ? 'complete' : action === 'cancel' ? 'cancelled' : 'scheduled';
      const update: Record<string, unknown> = { status };
      if (action === 'complete') update.completed_at = new Date().toISOString();
      if (startAt) update.scheduled_at = startAt;

      const { data: pv } = await supabase
        .from('pro_visits')
        .upsert({ jobber_visit_id: itemId, contractor_id: contractorId, ...update }, { onConflict: 'jobber_visit_id' })
        .select('contractor_id')
        .maybeSingle();

      const cid = pv?.contractor_id ?? contractorId;
      if (!cid) return;
      // Bump counters on applicants for that contractor.
      const { data: a } = await supabase
        .from('applicants')
        .select('id, completed_visits, contractor_cancel_count, last_jobber_event_at')
        .eq('contractor_id', cid)
        .maybeSingle();
      if (!a) return;
      const patch: Record<string, unknown> = { last_jobber_event_at: new Date().toISOString() };
      if (action === 'complete') {
        patch.completed_visits = (a.completed_visits ?? 0) + 1;
        patch.last_visit_at = new Date().toISOString();
      } else if (action === 'cancel') {
        patch.contractor_cancel_count = (a.contractor_cancel_count ?? 0) + 1;
      }
      await supabase.from('applicants').update(patch).eq('id', a.id);
    }

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
          await reflectToProVisits('complete');
        }
        break;
      case 'VISIT_RESCHEDULED':
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
          await reflectToProVisits('schedule', newDate);
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
